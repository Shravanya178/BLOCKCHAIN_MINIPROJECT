'use strict';

const express = require('express');
const asyncHandler = require('../../utils/asyncHandler');
const validate = require('../../middleware/validate');
const { authenticate } = require('../../middleware/auth');
const service = require('./events.service');
const { createEventSchema, updateEventSchema, listEventsSchema } = require('./events.schemas');

const router = express.Router();
router.use(authenticate);

router.post(
  '/',
  validate(createEventSchema),
  asyncHandler(async (req, res) => {
    res.status(201).json({ success: true, data: await service.createEvent(req.user, req.body, req.ip) });
  }),
);

router.get(
  '/',
  validate(listEventsSchema, 'query'),
  asyncHandler(async (req, res) => {
    const { items, meta } = await service.listEvents(req.user, req.validatedQuery);
    res.json({ success: true, data: items, meta });
  }),
);

router.get(
  '/:eventId',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.getEvent(req.user, req.params.eventId) });
  }),
);

router.patch(
  '/:eventId',
  validate(updateEventSchema),
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.updateEvent(req.user, req.params.eventId, req.body, req.ip) });
  }),
);

router.post(
  '/:eventId/archive',
  asyncHandler(async (req, res) => {
    res.json({ success: true, data: await service.archiveEvent(req.user, req.params.eventId, req.ip) });
  }),
);

module.exports = router;
