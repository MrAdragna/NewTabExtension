(function () {
  "use strict";

  var state = {
    plan: null,
    activeTab: "now",
    slideIndex: 0,
    currentActivityId: null,
    viewedIndex: null // null = auto-follow the current period; a number = manually previewing that schedule row
  };

  var els = {
    content: document.getElementById("content"),
    clock: document.getElementById("clock"),
    topbarTitle: document.getElementById("topbar-title"),
    tabNow: document.getElementById("tab-now"),
    tabResources: document.getElementById("tab-resources"),
    scheduleList: document.getElementById("schedule-list")
  };

  // ---- time helpers ----

  function minutesNow() {
    var d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  function parseHHMM(s) {
    var parts = String(s || "").split(":");
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return null;
    return h * 60 + m;
  }

  function findCurrentScheduleIndex(schedule) {
    if (!Array.isArray(schedule)) return -1;
    var now = minutesNow();
    for (var i = 0; i < schedule.length; i++) {
      var entry = schedule[i];
      var start = parseHHMM(entry.start);
      var end = parseHHMM(entry.end);
      if (start === null || end === null) continue;
      if (now >= start && now < end) return i;
    }
    return -1;
  }

  function findNextScheduleIndex(schedule) {
    if (!Array.isArray(schedule)) return -1;
    var now = minutesNow();
    var nextIndex = -1;
    var nextStart = null;
    for (var i = 0; i < schedule.length; i++) {
      var start = parseHHMM(schedule[i].start);
      if (start === null) continue;
      if (start > now && (nextStart === null || start < nextStart)) {
        nextIndex = i;
        nextStart = start;
      }
    }
    return nextIndex;
  }

  function formatClock() {
    var d = new Date();
    var h = d.getHours();
    var m = d.getMinutes();
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var mm = m < 10 ? "0" + m : String(m);
    return h12 + ":" + mm + " " + ampm;
  }

  function formatHHMMDisplay(hhmm) {
    var mins = parseHHMM(hhmm);
    if (mins === null) return hhmm;
    var h = Math.floor(mins / 60);
    var m = mins % 60;
    var ampm = h >= 12 ? "PM" : "AM";
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    var mm = m < 10 ? "0" + m : String(m);
    return h12 + ":" + mm + " " + ampm;
  }

  // ---- rendering: shared bits ----

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  function renderResourceList(items) {
    if (!Array.isArray(items) || items.length === 0) {
      return '<p class="empty-state-sub">No resources listed.</p>';
    }
    var html = '<ul class="resource-list">';
    items.forEach(function (item) {
      var label = escapeHtml(item.label || item.url || "Resource");
      var url = escapeHtml(item.url || "#");
      html +=
        '<li><a class="resource-item" href="' +
        url +
        '" target="_blank" rel="noopener noreferrer">' +
        label +
        "</a></li>";
    });
    html += "</ul>";
    return html;
  }

  function renderNotes(notes) {
    if (!notes) return "";
    return '<div class="notes-box">' + escapeHtml(notes) + "</div>";
  }

  // ---- rendering: activity types ----

  function renderActivity(activity) {
    if (!activity || !activity.type) {
      return renderEmptyState(
        "Nothing to show",
        "This activity couldn't be loaded. Check with the teacher's plan or the Resources tab."
      );
    }

    var titleHtml =
      '<h2 class="panel-title">' + escapeHtml(activity.title || "") + "</h2>";

    switch (activity.type) {
      case "resource-list":
        return (
          '<div class="panel">' +
          titleHtml +
          renderNotes(activity.notes) +
          renderResourceList(activity.items) +
          "</div>"
        );

      case "youtube":
        var videoId = escapeHtml(activity.videoId || "");
        var videoHtml = videoId
          ? '<div class="video-wrap"><iframe src="https://www.youtube-nocookie.com/embed/' +
            videoId +
            '" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe></div>'
          : '<p class="empty-state-sub">No video is set for this activity.</p>';
        return (
          '<div class="panel">' + titleHtml + renderNotes(activity.notes) + videoHtml + "</div>"
        );

      case "slides":
        return '<div class="panel">' + titleHtml + renderSlides(activity) + "</div>";

      case "module":
        var modUrl = escapeHtml(activity.url || "about:blank");
        return (
          '<div class="panel">' +
          titleHtml +
          renderNotes(activity.notes) +
          '<div class="module-wrap"><iframe src="' +
          modUrl +
          '"></iframe></div>' +
          "</div>"
        );

      default:
        return renderEmptyState(
          "Unsupported activity",
          'Activity type "' + escapeHtml(activity.type) + '" isn\u2019t supported yet.'
        );
    }
  }

  function renderSlides(activity) {
    var slides = Array.isArray(activity.slides) ? activity.slides : [];
    if (slides.length === 0) {
      return '<p class="empty-state-sub">No slides in this activity.</p>';
    }
    if (state.slideIndex >= slides.length) state.slideIndex = slides.length - 1;
    if (state.slideIndex < 0) state.slideIndex = 0;

    var slide = slides[state.slideIndex];
    var atStart = state.slideIndex === 0;
    var atEnd = state.slideIndex === slides.length - 1;

    return (
      '<div class="slide-box">' +
      '<h3 class="slide-heading">' +
      escapeHtml(slide.heading || "") +
      "</h3>" +
      '<p class="slide-body">' +
      escapeHtml(slide.body || "") +
      "</p>" +
      "</div>" +
      '<div class="slide-nav">' +
      '<button class="btn" id="slide-prev"' +
      (atStart ? " disabled" : "") +
      ">Previous</button>" +
      '<span class="slide-progress">' +
      (state.slideIndex + 1) +
      " / " +
      slides.length +
      "</span>" +
      '<button class="btn" id="slide-next"' +
      (atEnd ? " disabled" : "") +
      ">Next</button>" +
      "</div>"
    );
  }

  function renderEmptyState(title, sub) {
    return (
      '<div class="empty-state">' +
      '<p class="empty-state-title">' +
      escapeHtml(title) +
      "</p>" +
      '<p class="empty-state-sub">' +
      escapeHtml(sub) +
      "</p>" +
      "</div>"
    );
  }

  // ---- rendering: tabs ----

  function renderNowTab() {
    var plan = state.plan;
    if (!plan) {
      els.content.innerHTML = renderEmptyState(
        "Plans haven't loaded",
        "Check your connection and reload the page."
      );
      return;
    }

    var schedule = plan.schedule || [];
    var currentIndex = findCurrentScheduleIndex(schedule);
    var showIndex = state.viewedIndex !== null ? state.viewedIndex : currentIndex;

    if (showIndex === -1 || !schedule[showIndex]) {
      var nextIndex = findNextScheduleIndex(schedule);
      var sub =
        nextIndex !== -1
          ? "Next up: " +
            escapeHtml(schedule[nextIndex].label || "") +
            " at " +
            formatHHMMDisplay(schedule[nextIndex].start) +
            ". Check the Resources tab in the meantime."
          : "No more scheduled activities today. Check the Resources tab.";
      els.content.innerHTML = renderEmptyState("No activity right now", sub);
      state.currentActivityId = null;
      renderScheduleNav();
      return;
    }

    var entry = schedule[showIndex];
    var activity = plan.activities && plan.activities[entry.activity];

    if (entry.activity !== state.currentActivityId) {
      state.slideIndex = 0;
      state.currentActivityId = entry.activity;
    }

    var banner = "";
    if (showIndex !== currentIndex) {
      banner =
        '<div class="preview-banner"><span>Previewing ' +
        escapeHtml(entry.label || "this period") +
        " — this isn't the current class.</span>" +
        '<button class="btn" id="back-to-now-btn">Back to current class</button></div>';
    }

    els.content.innerHTML = banner + renderActivity(activity);
    wireActivityControls(activity);

    var backBtn = document.getElementById("back-to-now-btn");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        state.viewedIndex = null;
        render();
      });
    }

    renderScheduleNav();
  }

  function renderScheduleNav() {
    var plan = state.plan;
    var schedule = (plan && plan.schedule) || [];
    if (schedule.length === 0) {
      els.scheduleList.innerHTML =
        '<li class="empty-state-sub" style="padding:4px;">No schedule set.</li>';
      return;
    }

    var currentIndex = findCurrentScheduleIndex(schedule);
    var nextIndex = currentIndex === -1 ? findNextScheduleIndex(schedule) : -1;
    var now = minutesNow();
    var showIndex = state.viewedIndex !== null ? state.viewedIndex : currentIndex;

    var html = "";
    schedule.forEach(function (entry, i) {
      var start = parseHHMM(entry.start);
      var end = parseHHMM(entry.end);
      var status = "future";
      if (start !== null && end !== null) {
        if (now >= end) status = "elapsed";
        else if (i === currentIndex) status = "current";
      }
      var classes = "schedule-row " + status;
      if (i === showIndex && i !== currentIndex) classes += " previewing";

      html +=
        '<li class="' +
        classes +
        '" data-index="' +
        i +
        '">' +
        '<p class="row-label">' +
        escapeHtml(entry.label || "Period " + (i + 1)) +
        (i === nextIndex ? ' <span class="badge-next">Next</span>' : "") +
        "</p>" +
        '<p class="row-time">' +
        formatHHMMDisplay(entry.start) +
        " – " +
        formatHHMMDisplay(entry.end) +
        "</p>" +
        "</li>";
    });

    els.scheduleList.innerHTML = html;

    var rows = els.scheduleList.querySelectorAll(".schedule-row");
    rows.forEach(function (row) {
      row.addEventListener("click", function () {
        var idx = parseInt(row.getAttribute("data-index"), 10);
        state.viewedIndex = idx;
        setTab("now");
      });
    });
  }

  function renderResourcesTab() {
    var plan = state.plan;
    var groups = (plan && plan.alwaysAvailable) || [];
    if (groups.length === 0) {
      els.content.innerHTML =
        '<div class="panel">' +
        renderEmptyState("No resources yet", "Nothing has been added to Resources.") +
        "</div>";
      return;
    }

    var html = '<div class="panel">';
    groups.forEach(function (group) {
      html +=
        '<div class="resource-group"><p class="section-label">' +
        escapeHtml(group.label || "") +
        "</p>" +
        renderResourceList(group.items) +
        "</div>";
    });
    html += "</div>";
    els.content.innerHTML = html;
    renderScheduleNav();
  }

  function wireActivityControls(activity) {
    if (!activity || activity.type !== "slides") return;
    var prevBtn = document.getElementById("slide-prev");
    var nextBtn = document.getElementById("slide-next");
    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        state.slideIndex = Math.max(0, state.slideIndex - 1);
        renderNowTab();
      });
    }
    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        state.slideIndex = state.slideIndex + 1;
        renderNowTab();
      });
    }
  }

  function render() {
    if (state.activeTab === "now") {
      renderNowTab();
    } else {
      renderResourcesTab();
    }
  }

  // ---- tabs wiring ----

  function setTab(tab) {
    state.activeTab = tab;
    els.tabNow.classList.toggle("active", tab === "now");
    els.tabResources.classList.toggle("active", tab === "resources");
    render();
  }

  els.tabNow.addEventListener("click", function () {
    state.viewedIndex = null;
    setTab("now");
  });
  els.tabResources.addEventListener("click", function () {
    setTab("resources");
  });

  // ---- clock + polling ----

  function tickClock() {
    els.clock.textContent = formatClock();
  }

  function pollSchedule() {
    if (state.activeTab === "now") render();
  }

  // ---- load data ----

  function loadPlan() {
    fetch("data/plan.json", { cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.json();
      })
      .then(function (data) {
        state.plan = data;
        if (data.meta && data.meta.title) {
          els.topbarTitle.textContent = data.meta.title;
        }
        render();
      })
      .catch(function (err) {
        els.content.innerHTML = renderEmptyState(
          "Couldn't load today's plans",
          "There was a problem loading data/plan.json. Please let the teacher know."
        );
        console.error("SubView: failed to load plan.json", err);
      });
  }

  tickClock();
  setInterval(tickClock, 1000 * 15);
  setInterval(pollSchedule, 1000 * 30);
  loadPlan();
})();
