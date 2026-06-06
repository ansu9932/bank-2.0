const { Op } = require('sequelize');
const { CardRequest, User, Notification } = require('../models');
const { createAuditLog } = require('../middleware/auditLogger');
const { sendServiceRequestEmail } = require('../services/emailService');
const { success, created, error, badRequest, notFound } = require('../utils/apiResponse');
const logger = require('../utils/logger');

/* ──────────────────────────────────────────────────────────────────────────
   ALISTER BANK · SERVICE REQUESTS (Debit Card / Cheque Book)
   Thin pipeline over the existing CardRequest model. A user may hold only ONE
   un-resolved request per type at a time (duplicate gate); on success we notify
   + email them. Admins list and process (approve/decline) requests.
   ────────────────────────────────────────────────────────────────────────── */

// request_type values stored in the CardRequest model.
const TYPE_DEBIT_CARD = 'debit_card';
const TYPE_CHEQUE_BOOK = 'cheque_book';
// Statuses that mean a request is still "open" (blocks a duplicate submission).
const ACTIVE_STATUSES = ['pending', 'processing'];

const LABELS = {
  [TYPE_DEBIT_CARD]: 'Debit Card',
  [TYPE_CHEQUE_BOOK]: 'Cheque Book',
};

/**
 * Shared submission handler for both service types.
 * @param {object} req @param {object} res @param {string} requestType
 */
async function submitRequest(req, res, requestType) {
  try {
    const serviceLabel = LABELS[requestType];

    // ── Duplicate gate: reject if an un-resolved request of this type exists ──
    const existing = await CardRequest.findOne({
      where: { user_id: req.user.id, request_type: requestType, status: { [Op.in]: ACTIVE_STATUSES } },
    });
    if (existing) {
      return badRequest(res, `You already have a ${serviceLabel} request in progress (status: ${existing.status}).`);
    }

    const cardReq = await CardRequest.create({
      user_id: req.user.id,
      request_type: requestType,
      status: 'pending',
      delivery_address: req.body.deliveryAddress || req.user.address_line1 || null,
    });

    // In-app notification (best-effort).
    await Notification.create({
      user_id: req.user.id,
      title: `${serviceLabel} Request Received`,
      message: `Your ${serviceLabel} request has been received and is under review. Reference: ${cardReq.id}.`,
      type: 'system',
      priority: 'medium',
    }).catch((e) => logger.error(`Service-request notification failed: ${e.message}`));

    // Confirmation email — non-fatal (sendEmail never throws, but guard anyway).
    sendServiceRequestEmail(req.user.email, req.user.first_name || 'Customer', {
      serviceLabel,
      requestId: cardReq.id,
      createdAt: cardReq.createdAt,
    }).catch((e) => logger.error(`Service-request email failed: ${e.message}`));

    createAuditLog({
      userId: req.user.id,
      action: 'SERVICE_REQUEST_CREATED',
      entityType: 'CardRequest',
      entityId: cardReq.id,
      ipAddress: req.ip,
      status: 'success',
      description: `${serviceLabel} request submitted.`,
    }).catch(() => {});

    return created(res, {
      requestId: cardReq.id,
      requestType,
      status: cardReq.status,
    }, `${serviceLabel} request received. We'll email you once it's processed.`);
  } catch (err) {
    logger.error(`submitRequest (${requestType}) error: ${err.message}`);
    return error(res, 'Could not submit your request. Please try again.');
  }
}

// POST /api/requests/debit-card   (protected + active account)
exports.requestDebitCard = (req, res) => submitRequest(req, res, TYPE_DEBIT_CARD);

// POST /api/requests/checkbook    (protected + active account)
exports.requestCheckbook = (req, res) => submitRequest(req, res, TYPE_CHEQUE_BOOK);

// GET /api/requests/mine          (protected) — the user's own requests.
exports.getMyRequests = async (req, res) => {
  try {
    const requests = await CardRequest.findAll({
      where: { user_id: req.user.id },
      order: [['createdAt', 'DESC']],
      limit: 50,
    });
    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`getMyRequests error: ${err.message}`);
    return error(res, 'Could not fetch your requests.');
  }
};

// ─── Admin ────────────────────────────────────────────────────────────────────

// GET /api/admin/service-requests?status=&type=   (adminProtect)
exports.adminListRequests = async (req, res) => {
  try {
    const where = {};
    if (req.query.status) where.status = req.query.status;
    if (req.query.type) where.request_type = req.query.type;

    const requests = await CardRequest.findAll({
      where,
      include: [{
        model: User,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'email', 'phone', 'customer_id'],
      }],
      order: [['createdAt', 'DESC']],
      limit: 200,
    });
    return success(res, { requests, count: requests.length });
  } catch (err) {
    logger.error(`adminListRequests error: ${err.message}`);
    return error(res, 'Failed to fetch service requests.');
  }
};

// PATCH /api/admin/service-requests/:id   Body: { action: 'approve'|'decline'|'process', notes? }
//   (adminProtect + requireRole)
exports.adminProcessRequest = async (req, res) => {
  try {
    const { action, notes } = req.body;
    const map = { approve: 'dispatched', decline: 'cancelled', process: 'processing' };
    const newStatus = map[action];
    if (!newStatus) {
      return badRequest(res, "action must be one of 'approve', 'decline', or 'process'.");
    }

    const request = await CardRequest.findByPk(req.params.id, {
      include: [{ model: User, as: 'user', attributes: ['id', 'first_name', 'email'] }],
    });
    if (!request) return notFound(res, 'Service request not found.');

    const previousStatus = request.status;
    await request.update({ status: newStatus, notes: notes || request.notes });

    const serviceLabel = LABELS[request.request_type] || 'Service';
    const userMsg = {
      dispatched: `Your ${serviceLabel} request has been approved and is being dispatched.`,
      cancelled: `Your ${serviceLabel} request has been declined.${notes ? ` Reason: ${notes}` : ''}`,
      processing: `Your ${serviceLabel} request is now being processed.`,
    }[newStatus];

    if (request.user_id) {
      await Notification.create({
        user_id: request.user_id,
        title: `${serviceLabel} Request Update`,
        message: userMsg,
        type: 'system',
        priority: 'medium',
      }).catch((e) => logger.error(`Process-request notification failed: ${e.message}`));
    }

    createAuditLog({
      adminId: req.admin.id,
      userId: request.user_id,
      action: 'SERVICE_REQUEST_PROCESSED',
      entityType: 'CardRequest',
      entityId: request.id,
      oldValues: { status: previousStatus },
      newValues: { status: newStatus },
      ipAddress: req.ip,
      status: 'success',
      description: `${serviceLabel} request ${action} → ${newStatus}.`,
    }).catch(() => {});

    return success(res, {
      requestId: request.id,
      status: newStatus,
    }, `Request ${action}d successfully.`);
  } catch (err) {
    logger.error(`adminProcessRequest error: ${err.message}`);
    return error(res, 'Failed to update the service request.');
  }
}
