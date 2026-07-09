/**
 * Per-day opening hours editor for menu settings (data/locations.yaml).
 */
(function(global) {
  'use strict';

  var DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  var DAY_LABELS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  var DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function normTime(t) {
    t = String(t || '').trim();
    if (!t) return '';
    var parts = t.split(':');
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) || 0;
    if (isNaN(h)) return '';
    h = Math.max(0, Math.min(23, h));
    m = m >= 30 ? 30 : 0;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function timeMinutes(t) {
    t = normTime(t);
    if (!t) return 0;
    var p = t.split(':');
    return parseInt(p[0], 10) * 60 + parseInt(p[1], 10);
  }

  function isOvernight(open, close) {
    return timeMinutes(close) <= timeMinutes(open);
  }

  function defaultSegment() {
    return { open: '11:00', close: '22:00', overnight: false };
  }

  function parseDayEvents(events, dayIndex, oh) {
    var segments = [];
    if (!Array.isArray(events)) return segments;
    var i = 0;
    while (i < events.length) {
      var ev = events[i];
      if (!ev || !ev.type) { i++; continue; }
      var type = String(ev.type).toLowerCase();
      var time = normTime(ev.time);
      if (!time) { i++; continue; }
      if (type === 'close' && segments.length === 0) {
        segments.push({ open: '00:00', close: time, overnight: false, carryIn: true });
        i++;
        continue;
      }
      if (type === 'open') {
        var open = time;
        i++;
        if (i < events.length && String(events[i].type).toLowerCase() === 'close') {
          var close = normTime(events[i].time);
          var overnight = close && isOvernight(open, close);
          segments.push({ open: open, close: close, overnight: overnight, carryIn: false });
          i++;
        } else {
          var nextKey = DAY_KEYS[(dayIndex + 1) % 7];
          var nextEvents = oh && oh[nextKey];
          var closeTime = '02:00';
          if (Array.isArray(nextEvents) && nextEvents.length) {
            var first = nextEvents[0];
            if (first && String(first.type).toLowerCase() === 'close' && first.time) {
              closeTime = normTime(first.time);
            }
          }
          segments.push({ open: open, close: closeTime, overnight: true, carryIn: false });
        }
        continue;
      }
      i++;
    }
    return segments;
  }

  function buildOpeningHours(daysState) {
    var result = { mode: 'Auto' };
    var pendingClose = null;

    DAY_KEYS.forEach(function(key) {
      var d = daysState[key] || { open: false, segments: [] };
      var events = [];

      if (pendingClose) {
        events.push({ type: 'Close', time: pendingClose });
        pendingClose = null;
      }

      if (!d.open) {
        if (events.length) result[key] = events;
        return;
      }

      (d.segments || []).forEach(function(seg) {
        if (seg.carryIn) return;
        var open = normTime(seg.open);
        var close = normTime(seg.close);
        if (!open || !close) return;
        var overnight = seg.overnight || isOvernight(open, close);
        events.push({ type: 'Open', time: open });
        if (overnight) {
          pendingClose = close;
        } else {
          events.push({ type: 'Close', time: close });
        }
      });

      if (events.length) result[key] = events;
    });

    if (pendingClose) {
      var sunEvents = result.sun || [];
      sunEvents.unshift({ type: 'Close', time: pendingClose });
      result.sun = sunEvents;
    }

    return result;
  }

  function loadFromOpeningHours(oh) {
    var mode = 'Auto';
    var days = {};
    DAY_KEYS.forEach(function(key) {
      days[key] = { open: false, segments: [] };
    });
    if (!oh || typeof oh !== 'object') {
      DAY_KEYS.forEach(function(key) {
        days[key].open = true;
        days[key].segments = [defaultSegment()];
      });
      return { mode: mode, days: days };
    }
    mode = String(oh.mode || 'Auto');
    if (mode === 'AlwaysOpen' || mode === 'AlwaysClosed') {
      return { mode: mode, days: days };
    }
    DAY_KEYS.forEach(function(key, idx) {
      var segs = parseDayEvents(oh[key], idx, oh);
      if (segs.length) {
        days[key].open = segs.some(function(s) { return !s.carryIn; });
        days[key].segments = segs;
      }
    });
    return { mode: mode, days: days };
  }

  function formatTime12(t) {
    t = normTime(t);
    if (!t) return '';
    var p = t.split(':');
    var h = parseInt(p[0], 10);
    var m = p[1];
    var suffix = h >= 12 ? 'PM' : 'AM';
    var h12 = h % 12;
    if (h12 === 0) h12 = 12;
    return h12 + ':' + m + ' ' + suffix;
  }

  function formatSegmentSummary(seg) {
    if (seg.carryIn) return 'until ' + formatTime12(seg.close);
    var open = normTime(seg.open);
    var close = normTime(seg.close);
    if (!open || !close) return '';
    var overnight = seg.overnight || isOvernight(open, close);
    if (overnight) {
      return formatTime12(open) + ' – ' + formatTime12(close) + ' (next day)';
    }
    return formatTime12(open) + ' – ' + formatTime12(close);
  }

  function formatDaySummary(day) {
    if (!day.open) return 'Closed';
    var parts = (day.segments || []).map(formatSegmentSummary).filter(Boolean);
    return parts.length ? parts.join(', ') : 'Closed';
  }

  function TtmsSettingsLocationHours(rootEl) {
    this.root = rootEl;
    this.modeEl = document.getElementById('settingsLocationHoursMode');
    this.editorEl = document.getElementById('settingsLocationHoursEditor');
    this.daysEl = document.getElementById('settingsLocationHoursDays');
    this.quickOpenEl = document.getElementById('settingsLocationHoursQuickOpen');
    this.quickCloseEl = document.getElementById('settingsLocationHoursQuickClose');
    this.applyAllBtn = document.getElementById('settingsLocationHoursApplyAll');
    this.state = loadFromOpeningHours(null);
    this._bindMode();
    this._bindQuickApply();
    this._renderDays();
    this._syncModeUi();
  }

  TtmsSettingsLocationHours.prototype._bindMode = function() {
    var self = this;
    if (this.modeEl) {
      this.modeEl.addEventListener('change', function() {
        self.state.mode = self.modeEl.value;
        self._syncModeUi();
      });
    }
  };

  TtmsSettingsLocationHours.prototype._bindQuickApply = function() {
    var self = this;
    if (this.applyAllBtn) {
      this.applyAllBtn.addEventListener('click', function() {
        var open = normTime(self.quickOpenEl && self.quickOpenEl.value) || '11:00';
        var close = normTime(self.quickCloseEl && self.quickCloseEl.value) || '22:00';
        var overnight = isOvernight(open, close);
        DAY_KEYS.forEach(function(key) {
          self.state.days[key].open = true;
          self.state.days[key].segments = [{ open: open, close: close, overnight: overnight, carryIn: false }];
        });
        self._renderDays();
      });
    }
  };

  TtmsSettingsLocationHours.prototype._syncModeUi = function() {
    var mode = this.modeEl ? this.modeEl.value : this.state.mode;
    var auto = mode === 'Auto';
    if (this.editorEl) this.editorEl.classList.toggle('hidden', !auto);
    if (this.modeEl) this.modeEl.value = mode;
  };

  TtmsSettingsLocationHours.prototype._updateRowSummary = function(block, day) {
    var summary = block.querySelector('.settings-location-hours-summary');
    if (summary) {
      summary.textContent = formatDaySummary(day);
      summary.classList.toggle('settings-location-hours-summary--closed', !day.open);
    }
    var main = block.querySelector('.settings-location-hours-row-main');
    if (main) main.classList.toggle('settings-location-hours-row-main--closed', !day.open);
  };

  TtmsSettingsLocationHours.prototype._renderDayDetails = function(day, detailEl, onChange) {
    detailEl.innerHTML = '';

    var carryIn = (day.segments || []).filter(function(s) { return s.carryIn; });
    var editable = (day.segments || []).filter(function(s) { return !s.carryIn; });
    if (!editable.length && day.open) {
      editable.push(defaultSegment());
      day.segments = carryIn.concat(editable);
    }

    if (carryIn.length) {
      var note = document.createElement('p');
      note.className = 'settings-location-hours-carry-note';
      note.textContent = 'Still open from the previous night until ' + formatTime12(carryIn[0].close) + '.';
      detailEl.appendChild(note);
    }

    var list = document.createElement('div');
    list.className = 'settings-location-hours-shift-list';
    detailEl.appendChild(list);

    function renderShifts() {
      list.innerHTML = '';
      editable.forEach(function(seg, segIdx) {
        var row = document.createElement('div');
        row.className = 'settings-location-hours-shift';

        var fromLab = document.createElement('label');
        fromLab.className = 'settings-location-hours-shift-field';
        fromLab.innerHTML = '<span>Open</span>';
        var openInput = document.createElement('input');
        openInput.type = 'time';
        openInput.className = 'dashboard-settings-input settings-location-hours-open';
        openInput.value = normTime(seg.open) || '11:00';
        fromLab.appendChild(openInput);

        var toLab = document.createElement('label');
        toLab.className = 'settings-location-hours-shift-field';
        toLab.innerHTML = '<span>Close</span>';
        var closeInput = document.createElement('input');
        closeInput.type = 'time';
        closeInput.className = 'dashboard-settings-input settings-location-hours-close';
        closeInput.value = normTime(seg.close) || '22:00';
        toLab.appendChild(closeInput);

        var hint = document.createElement('span');
        hint.className = 'settings-location-hours-shift-hint hidden';

        function syncOvernightHint() {
          var openT = normTime(openInput.value);
          var closeT = normTime(closeInput.value);
          var overnight = openT && closeT && isOvernight(openT, closeT);
          seg.overnight = overnight;
          hint.textContent = overnight ? 'Closes the next morning' : '';
          hint.classList.toggle('hidden', !overnight);
        }

        openInput.addEventListener('change', function() {
          seg.open = normTime(openInput.value);
          syncOvernightHint();
          onChange();
        });
        closeInput.addEventListener('change', function() {
          seg.close = normTime(closeInput.value);
          syncOvernightHint();
          onChange();
        });

        syncOvernightHint();

        var removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'btn-dash btn-dash-secondary settings-location-hours-shift-remove';
        removeBtn.setAttribute('aria-label', 'Remove shift');
        removeBtn.innerHTML = '<i class="fa fa-times" aria-hidden="true"></i>';
        removeBtn.disabled = editable.length <= 1;
        removeBtn.addEventListener('click', function() {
          if (editable.length <= 1) return;
          editable.splice(segIdx, 1);
          day.segments = carryIn.concat(editable);
          renderShifts();
          onChange();
        });

        row.appendChild(fromLab);
        row.appendChild(document.createTextNode('–'));
        row.appendChild(toLab);
        row.appendChild(hint);
        row.appendChild(removeBtn);
        list.appendChild(row);
      });
    }

    renderShifts();

    if (editable.length < 2) {
      var addShift = document.createElement('button');
      addShift.type = 'button';
      addShift.className = 'btn-dash btn-dash-secondary settings-location-hours-add-shift';
      addShift.textContent = '+ Add another shift';
      addShift.addEventListener('click', function() {
        editable.push(defaultSegment());
        day.segments = carryIn.concat(editable);
        renderShifts();
        onChange();
      });
      detailEl.appendChild(addShift);
    }
  };

  TtmsSettingsLocationHours.prototype._renderDays = function() {
    var self = this;
    if (!this.daysEl) return;
    this.daysEl.innerHTML = '';

    DAY_KEYS.forEach(function(key, idx) {
      var day = self.state.days[key];
      var block = document.createElement('div');
      block.className = 'settings-location-hours-row';
      block.setAttribute('data-day', key);

      var main = document.createElement('div');
      main.className = 'settings-location-hours-row-main';
      if (!day.open) main.classList.add('settings-location-hours-row-main--closed');

      var toggleWrap = document.createElement('label');
      toggleWrap.className = 'dashboard-switch settings-location-hours-toggle';
      var openCb = document.createElement('input');
      openCb.type = 'checkbox';
      openCb.className = 'dashboard-switch-input settings-location-hours-day-open';
      openCb.checked = day.open;
      openCb.id = 'settingsLocationHoursDayOpen-' + key;
      var track = document.createElement('span');
      track.className = 'dashboard-switch-track';
      track.setAttribute('aria-hidden', 'true');
      toggleWrap.appendChild(openCb);
      toggleWrap.appendChild(track);

      var nameEl = document.createElement('span');
      nameEl.className = 'settings-location-hours-day-name';
      nameEl.textContent = DAY_SHORT[idx];

      var summary = document.createElement('span');
      summary.className = 'settings-location-hours-summary';
      if (!day.open) summary.classList.add('settings-location-hours-summary--closed');
      summary.textContent = formatDaySummary(day);

      var expandBtn = document.createElement('button');
      expandBtn.type = 'button';
      expandBtn.className = 'btn-dash btn-dash-secondary settings-location-hours-expand';
      expandBtn.textContent = 'Edit';
      expandBtn.setAttribute('aria-expanded', 'false');
      expandBtn.setAttribute('aria-label', 'Edit ' + DAY_LABELS[idx] + ' hours');

      main.appendChild(toggleWrap);
      main.appendChild(nameEl);
      main.appendChild(summary);
      main.appendChild(expandBtn);
      block.appendChild(main);

      var detail = document.createElement('div');
      detail.className = 'settings-location-hours-detail hidden';
      block.appendChild(detail);

      function onDetailChange() {
        self._updateRowSummary(block, day);
      }

      expandBtn.addEventListener('click', function() {
        var open = detail.classList.contains('hidden');
        detail.classList.toggle('hidden', !open);
        expandBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
        expandBtn.textContent = open ? 'Done' : 'Edit';
        if (open && !detail.childNodes.length) {
          self._renderDayDetails(day, detail, onDetailChange);
        }
      });

      openCb.addEventListener('change', function() {
        day.open = openCb.checked;
        if (day.open && !day.segments.some(function(s) { return !s.carryIn; })) {
          day.segments = day.segments.filter(function(s) { return s.carryIn; });
          day.segments.push(defaultSegment());
        }
        if (!day.open) {
          day.segments = day.segments.filter(function(s) { return s.carryIn; });
        }
        self._updateRowSummary(block, day);
        main.classList.toggle('settings-location-hours-row-main--closed', !day.open);
        expandBtn.disabled = !day.open;
        if (!day.open) {
          detail.classList.add('hidden');
          expandBtn.setAttribute('aria-expanded', 'false');
          expandBtn.textContent = 'Edit';
          detail.innerHTML = '';
        }
      });

      expandBtn.disabled = !day.open;
      self.daysEl.appendChild(block);
    });
  };

  TtmsSettingsLocationHours.prototype.load = function(openingHours) {
    this.state = loadFromOpeningHours(openingHours);
    if (this.modeEl) this.modeEl.value = this.state.mode;
    this._syncModeUi();
    this._renderDays();
  };

  TtmsSettingsLocationHours.prototype.export = function() {
    var mode = this.modeEl ? this.modeEl.value : this.state.mode;
    if (mode !== 'Auto') return { mode: mode };

    var daysState = {};
    var self = this;
    DAY_KEYS.forEach(function(key) {
      var block = self.daysEl && self.daysEl.querySelector('.settings-location-hours-row[data-day="' + key + '"]');
      if (!block) {
        daysState[key] = self.state.days[key] || { open: false, segments: [] };
        return;
      }
      var openCb = block.querySelector('.settings-location-hours-day-open');
      var open = openCb && openCb.checked;
      var segments = [];
      var carryIn = (self.state.days[key].segments || []).filter(function(s) { return s.carryIn; });
      block.querySelectorAll('.settings-location-hours-shift').forEach(function(row) {
        var openInput = row.querySelector('.settings-location-hours-open');
        var closeInput = row.querySelector('.settings-location-hours-close');
        var openT = normTime(openInput && openInput.value);
        var closeT = normTime(closeInput && closeInput.value);
        if (!openT || !closeT) return;
        segments.push({
          open: openT,
          close: closeT,
          overnight: isOvernight(openT, closeT),
          carryIn: false
        });
      });
      if (!segments.length && open) {
        var stateSegs = (self.state.days[key].segments || []).filter(function(s) { return !s.carryIn; });
        stateSegs.forEach(function(seg) {
          segments.push({
            open: normTime(seg.open),
            close: normTime(seg.close),
            overnight: seg.overnight || isOvernight(seg.open, seg.close),
            carryIn: false
          });
        });
      }
      daysState[key] = { open: open, segments: carryIn.concat(segments) };
    });
    return buildOpeningHours(daysState);
  };

  global.TtmsSettingsLocationHours = {
    create: function() {
      var root = document.getElementById('settingsLocationHoursEditor');
      if (!root) return null;
      return new TtmsSettingsLocationHours(root);
    }
  };
})(window);
