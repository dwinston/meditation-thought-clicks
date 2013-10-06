Meditations = new Meteor.Collection("meditations");

if (Meteor.isClient) {

  Session.setDefault("inMeditation", false);
  var sessionDurationDivisor = 1; // e.g., set to "5" for 5min to be 1min

  var gong = new Audio("gong.wav"); // buffers automatically when created
  var plot = null;

  var median = function(values) {
    values = _.toArray(values).sort(function(a,b) { return a - b; });
    var half = Math.floor(values.length / 2);
 
    if (values.length % 2 == 1) { // odd # of values
      return values[half];
    } else {
      return (values[half-1] + values[half]) / 2;
    }
  };

  var medianSeriesForPlot = function(rawData) {
    var starts = _.map(rawData, function (series) {
      return series[0][0];
    });
    var medians = _.map(rawData, function (series) {
      return median(_.pluck(series, "1"));
    });
    return _.zip(starts, medians);
  };

  var getMeditationsForPlot = function () {
    var rawData = Meditations.find().map(function (m) {
      return _.map(m.durations, function (d) {
        return [m.start, d / 1000]; // d : msec->seconds
      });
    });
    // last datum empty on start of meditation session, so need to reject it:
    rawData = _.reject(rawData, _.isEmpty); 
    return rawData.concat({
      data: medianSeriesForPlot(rawData),
			lines: { show: true }
    });
  };

  var refreshPlot = function () {
    plot.setData(getMeditationsForPlot());
    plot.setupGrid();
    plot.draw();
  };

  var thoughtReturn = function () {
    mId = Session.get("mId");
    var meditation = Meditations.findOne(mId);
    var now = moment().valueOf();
    var duration = now - Session.get("lastClickAt");
    Meditations.update(mId, {
      $push: {durations: duration}
    }, function () {
      refreshPlot();
    });
    Session.set("lastClickAt", now);
  }

  Template.hello.events({
    'submit #newSession' : function (evt, templ) {
      evt.preventDefault();      
      
      // One can start a meditation and not move the mouse cursor off
      // the form submission button, and all will be well.
      // For this to work, the click event must bubble/propagate.
      if (Session.get("inMeditation")) { return; }

      var start = moment();
      var end = moment().add('minutes', +templ.find("#minutes").value);
      var sessionDuration = end.valueOf() - start.valueOf();
      Session.set("mId", Meditations.insert({
        start: start.valueOf(),
        end: end.valueOf(),
        durations: [] // in ms
      }));

      gong.play();
      Session.set("inMeditation", true);
      Session.set("lastClickAt", start.valueOf());
      Meteor.setTimeout(function () {
        gong.play();
        if (Session.equals("lastClickAt", start.valueOf())) {
          // Woohoo! Made it all the way through!
          thoughtReturn();
        }
        Session.set("inMeditation", false);
      }, sessionDuration / sessionDurationDivisor);

    },    
    "click #hello" : function (evt, templ) {
      // Clicked anywhere on page
      if (Session.get("inMeditation")) {
        thoughtReturn();
      }
    }
  });

  Meteor.startup(function() {
    var options = {
      xaxis: {mode: "time",
              timezone: "browser",
              twelveHourClock: true
//              , tickSize: [1, "day"]
             },
      yaxis: {
        transform: function (v) { return Math.log(v); },
        inverseTransform: function (v) { return Math.exp(v); },
        ticks: [[1, "1 second"], [60, "one minute"], [300, "five minutes"], 
                [600, "ten minutes"], [1800, "thirty minutes"], 
                [3600, "one hour"]],
        min: 0.5,
        max: 3600
      },
      series: {
        lines: {show: false},
        points: {show: true}
      }
    };
    plot = $.plot($("#recoveriesPlot"), getMeditationsForPlot(), options);

    Deps.autorun(function() {
      if (Meditations.find().count() > 0) {
        refreshPlot();
      }
    });
  });

}

if (Meteor.isServer) {

  var populate = function () {
    var numDays = 10;
    var starts = _.times(numDays, function (i) { 
      return +moment().subtract('days', numDays).add('days', i); 
    });
    var ends = _.map(starts, function (start) {
      return +moment(start).add('minutes', _.sample(_.range(5,60,5)));
    });
    _.forEach(starts, function (start, i) {
      var end = ends[i];
      var clicks = _.sample(_.range(start, end), _.random(3,10));
      var durations = _.times(clicks.length, function (i) { 
        return clicks[i] - start; 
      });
      Meditations.insert({
        start: start,
        end: end,
        durations: durations
      });
    });
  };


  Meteor.startup(function () {
    // bootstrap
    if (Meditations.find().count() === 0) {
      //populate();
    }
  });
}
