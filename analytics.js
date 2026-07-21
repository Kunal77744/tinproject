!(function (document, posthog) {
  var methods;
  var methodIndex;
  var script;
  var firstScript;

  if (posthog.__SV) return;

  window.posthog = posthog;
  posthog._i = [];
  posthog.init = function (projectKey, config, instanceName) {
    function stub(target, method) {
      var parts = method.split(".");

      if (parts.length === 2) {
        target = target[parts[0]];
        method = parts[1];
      }

      target[method] = function () {
        target.push([method].concat(Array.prototype.slice.call(arguments)));
      };
    }

    script = document.createElement("script");
    script.type = "text/javascript";
    script.crossOrigin = "anonymous";
    script.async = true;
    script.src =
      config.api_host.replace(".i.posthog.com", "-assets.i.posthog.com") +
      "/static/array.js";
    firstScript = document.getElementsByTagName("script")[0];
    firstScript.parentNode.insertBefore(script, firstScript);

    var instance = posthog;
    if (instanceName !== undefined) {
      instance = posthog[instanceName] = [];
    } else {
      instanceName = "posthog";
    }

    instance.people = instance.people || [];
    instance.toString = function (includeStub) {
      var name = "posthog";
      if (instanceName !== "posthog") name += "." + instanceName;
      if (!includeStub) name += " (stub)";
      return name;
    };
    instance.people.toString = function () {
      return instance.toString(true) + ".people (stub)";
    };

    methods =
      "init capture register register_once register_for_session unregister unregister_for_session getFeatureFlag getFeatureFlagResult isFeatureEnabled reloadFeatureFlags updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures on onFeatureFlags onSessionId getSurveys getActiveMatchingSurveys renderSurvey canRenderSurvey getNextSurveyStep identify setPersonProperties group resetGroups setPersonPropertiesForFlags resetPersonPropertiesForFlags setGroupPropertiesForFlags resetGroupPropertiesForFlags reset get_distinct_id getGroups get_session_id get_session_replay_url alias set_config startSessionRecording stopSessionRecording sessionRecordingStarted captureException loadToolbar get_property getSessionProperty createPersonProfile opt_in_capturing opt_out_capturing has_opted_in_capturing has_opted_out_capturing clear_opt_in_out_capturing debug".split(
        " ",
      );

    for (methodIndex = 0; methodIndex < methods.length; methodIndex += 1) {
      stub(instance, methods[methodIndex]);
    }

    posthog._i.push([projectKey, config, instanceName]);
  };
  posthog.__SV = 1;
})(document, window.posthog || []);

posthog.init("phc_oMaktxRgHwFS89pc7JvsVVtPTv4R6foqNYMhkK5MaEVt", {
  api_host: "https://us.i.posthog.com",
  defaults: "2026-05-30",
  autocapture: false,
  capture_pageview: false,
  capture_pageleave: true,
  disable_session_recording: true,
  person_profiles: "identified_only",
});

posthog.capture("landing_page_viewed", {
  route: window.location.pathname,
});
