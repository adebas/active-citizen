var express = require('express');
var router = express.Router();
var newsFeedFilter = ("../engine/newsfeed_filter");
var models = require("../../models");
var auth = require('../authorization');
var log = require('../utils/logger');
var toJson = require('../utils/to_json');
var _ = require('lodash');

var moment = require('moment');

var getRecommendationFor = require('../engine/recommendations/events_manager').getRecommendationFor;
var airbrake = require('airbrake').createClient(process.env.AIRBRAKE_PROJECT_ID, process.env.AIRBRAKE_API_KEY);

var OVERALL_LIMIT=7;

var DATE_OPTIONS = { after: moment().add(-3, 'months').toDate() };

var setupOptions = function (req) {
  var options = {
    user_id: req.user ? req.user.id : -1
  };

  return options;
};

var processRecommendations = function (levelType, req, res, recommendedItemIds, error) {
  var finalIds;

  if (error) {
    finalIds = [];
    log.error("Recommendation Error "+levelType, { err: error, id: req.params.id, userId:  req.user ? req.user.id : -1, errorStatus:  500 });
    airbrake.notify(error, function(airbrakeErr, url) {
      if (airbrakeErr) {
        log.error("AirBrake Error", { context: 'airbrake', err: airbrakeErr, errorStatus: 500 });
      }
    });
  } else {
    finalIds = _.shuffle(recommendedItemIds);
    finalIds = _.dropRight(finalIds, OVERALL_LIMIT);
  }

  log.info("Recommendations domains status", { recommendedItemIds: recommendedItemIds });

  models.Post.findAll({
    where: {
      id: {
        $in: finalIds
      }
    },
    include: [
      {
        // Category
        model: models.Category,
        required: false,
        include: [
          {
            model: models.Image,
            required: false,
            as: 'CategoryIconImages'
          }
        ]
      },
      // Group
      {
        model: models.Group,
        include: [
          {
            model: models.Category,
            required: false
          },
          {
            model: models.Community,
            attributes: ['id','name','theme_id'],
            required: false
          }
        ]
      },
      // User
      {
        model: models.User,
        required: false,
        attributes: models.User.defaultAttributesWithSocialMediaPublic
      },
      // Image
      {
        model: models.Image,
        required: false,
        as: 'PostHeaderImages'
      },
      // PointRevision
      {
        model: models.PostRevision,
        required: false
      }
    ]
  }).then(function(posts) {
    res.send(posts);
  }).catch(function(error) {
    log.error("Recommendation Error "+levelType, { err: error, id: req.params.id, userId:  req.user ? req.user.id : -1, errorStatus: 500 });
    res.sendStatus(500);
  });
};

router.get('/domains/:id', auth.can('view domain'), function(req, res) {
  var options = setupOptions(req);

  options = _.merge(options, {
    domain_id: req.params.id,
    limit: OVERALL_LIMIT*2
  });

  getRecommendationFor(options.user_id, DATE_OPTIONS, options, function (error, recommendedItemIds) {
    processRecommendations("domain", req, res, recommendedItemIds, error);
  });
});

router.get('/communities/:id', auth.can('view community'), auth.isLoggedIn, function(req, res) {
  var options = setupOptions(req);

  options = _.merge(options, {
    community_id: req.params.id,
    limit: OVERALL_LIMIT*2
  });

  getRecommendationFor(options.user_id, DATE_OPTIONS, options, function (error, recommendedItemIds) {
    processRecommendations("community", req, res, recommendedItemIds, error);
  });
});

router.get('/groups/:id', auth.can('view group'), auth.isLoggedIn, function(req, res) {
  var options = setupOptions(req);

  options = _.merge(options, {
    group_id: req.params.id,
    limit: OVERALL_LIMIT*2
  });

  getRecommendationFor(options.user_id, DATE_OPTIONS, options, function (error, recommendedItemIds) {
    processRecommendations("group", req, res, recommendedItemIds, error);
  });
});

module.exports = router;