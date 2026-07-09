// Opening Hours Management System
// Handles both display and status logic

// ========================================
// TODAY'S HOURS DISPLAY
// ========================================

function initOpeninghoursDisplay() {
  console.log('initOpeninghoursDisplay called');
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const today = days[new Date().getDay()];
  console.log('Today is:', today);

  const sections = document.querySelectorAll("[data-opening-hours]");
  console.log('Found', sections.length, 'sections with data-opening-hours');

  sections.forEach((section, index) => {
    // Location picker cards store JSON hours for status badges, not today-hours UI
    if (
      section.classList.contains('location-picker-card') ||
      section.closest('.location-picker') ||
      section.hasAttribute('data-picker-clone')
    ) {
      return;
    }

    console.log(`Processing section ${index}:`, section);
    const todayList = section.querySelector(".today-hours");
    const allItems = section.querySelectorAll(".all-hours li");
    
    console.log('Today list element:', todayList);
    console.log('All items found:', allItems.length);

    // Clear existing content first to prevent duplicates
    if (todayList) {
      todayList.innerHTML = '';
    }

    allItems.forEach(li => {
      if (li.dataset.day === today) {
        console.log('Found today\'s hours:', li.textContent);
        todayList.appendChild(li.cloneNode(true));
      }
    });
  });
}

// ========================================
// NAVIGATION BAR VISIBILITY
// ========================================

function initDisplayNavBar() {
  const targets = document.querySelectorAll(".frontpageads");
  const fadeEl = document.getElementById("footerBtns");
  if (!targets.length || !fadeEl) {
    console.error("Missing target(s) or fadeEl");
    return;
  }

  let visibleCount = 0;

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        visibleCount++;
      } else {
        visibleCount--;
      }

      // Clamp the value between 0 and number of targets
      visibleCount = Math.max(0, Math.min(visibleCount, targets.length));

      if (visibleCount > 0 ) {
        fadeEl.classList.remove("visible");
      } else {
        fadeEl.classList.add("visible");
      }
    });
  });

  targets.forEach(target => observer.observe(target));
}

// ========================================
// OPENING STATUS LOGIC
// ========================================

function getOpenSigns() {
  console.log('getOpenSigns called');
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

  function to24Hour(timeStr) {
    const [time, modifier] = timeStr.toLowerCase().split(/(am|pm)/).filter(Boolean);
    let [hours, minutes] = time.split(":").map(Number);
    if (modifier === "pm" && hours !== 12) hours += 12;
    if (modifier === "am" && hours === 12) hours = 0;
    return { hours, minutes };
  }

  function toDateToday(timeStr) {
    const { hours, minutes } = to24Hour(timeStr);
    const date = new Date();
    date.setHours(hours, minutes, 0, 0);
    console.log('toDateToday:', timeStr, '->', date, '(hours:', hours, 'minutes:', minutes, ')');
    return date;
  }

  function toDateYesterday(timeStr) {
    const { hours, minutes } = to24Hour(timeStr);
    const date = new Date();
    date.setDate(date.getDate() - 1); // Set to yesterday
    date.setHours(hours, minutes, 0, 0);
    console.log('toDateYesterday:', timeStr, '->', date, '(hours:', hours, 'minutes:', minutes, ')');
    return date;
  }

  function getTimeRange(text) {
    const match = text.trim().match(/(\d{1,2}:\d{2}\s?(am|pm))\s*–\s*(\d{1,2}:\d{2}\s?(am|pm))/i);
    if (!match) return null;
    return { start: match[1], end: match[3] };
  }

  function updateStatus() {
    console.log('updateStatus called');
    const now = new Date();
    const todayIndex = now.getDay();
    const todayDay = days[todayIndex];
    const yesterdayIndex = (todayIndex - 1 + 7) % 7; // Handle Sunday case
    const yesterdayDay = days[yesterdayIndex];
    
    console.log('Current time:', now);
    console.log('Today:', todayDay, 'Yesterday:', yesterdayDay);
    console.log('Current hour:', now.getHours(), 'Current minute:', now.getMinutes());

    const panels = document.querySelectorAll(".location-card");
    if (!panels.length) {
      if (window._ttmsOpenSignsInterval) {
        clearInterval(window._ttmsOpenSignsInterval);
        window._ttmsOpenSignsInterval = null;
      }
      return;
    }
    console.log('Found', panels.length, 'location-card elements');

    panels.forEach((panel, i) => {
      const hours = panel.querySelector(".hours");
      if (!hours) {
        return;
      }
      console.log(`Processing panel ${i}:`, panel);
      const allHoursList = hours?.querySelector(".all-hours");
      const todayLi = allHoursList?.querySelector(`li[data-day="${todayDay}"]`);
      const yesterdayLi = allHoursList?.querySelector(`li[data-day="${yesterdayDay}"]`);
      
      console.log('Hours element:', hours);
      console.log('All hours list:', allHoursList);
      console.log('Today li:', todayLi);
      console.log('Yesterday li:', yesterdayLi);
      
      // First, check if we're in yesterday's overnight hours
      let isCurrentlyOpen = false;
      let minsToClose = -1;
      let minsToOpen = -1;
      
      if (yesterdayLi) {
        const yesterdayRange = getTimeRange(yesterdayLi.textContent);
        if (yesterdayRange) {
          console.log('Yesterday range found:', yesterdayRange);
          const yesterdayStart = toDateYesterday(yesterdayRange.start);
          let yesterdayEnd = toDateToday(yesterdayRange.end);
          
          console.log('Yesterday start (raw):', yesterdayStart);
          console.log('Yesterday end (raw):', yesterdayEnd);
          
           // Check if yesterday was overnight (close time is before open time)
           const isYesterdayOvernight = yesterdayEnd <= yesterdayStart;
           console.log('Is yesterday overnight?', isYesterdayOvernight);
           
           // For overnight detection, we need to compare times on the same day
           // So we need to check if the end time (2:00am) is before the start time (11:00am)
           const yesterdayStartTime = toDateToday(yesterdayRange.start);
           const yesterdayEndTime = toDateToday(yesterdayRange.end);
           const isActuallyOvernight = yesterdayEndTime <= yesterdayStartTime;
           console.log('Actual overnight check - Start time today:', yesterdayStartTime, 'End time today:', yesterdayEndTime);
           console.log('Is actually overnight?', isActuallyOvernight);
           
           if (isActuallyOvernight) {
             // For overnight hours, the end time should be the same day as the start time
             // Since yesterdayStart is Tuesday and yesterdayEnd is Wednesday, we need to keep it as Wednesday
             // Don't add an extra day - the overnight hours end on Wednesday 2:00 AM
             console.log('Yesterday was overnight, keeping end time as Wednesday 2:00 AM');
             
             // Only check overnight hours if it's actually overnight
             console.log('=== OVERNIGHT TIME COMPARISON ===');
             console.log('Current time (now):', now.toISOString());
             console.log('Yesterday start:', yesterdayStart.toISOString());
             console.log('Yesterday end (Wednesday 2:00 AM):', yesterdayEnd.toISOString());
             console.log('now >= yesterdayStart:', now >= yesterdayStart);
             console.log('now < yesterdayEnd:', now < yesterdayEnd);
             
             // Check if we're currently in yesterday's overnight hours
             // IMPORTANT: For overnight hours, we need to check if current time is between
             // yesterday's start time and the adjusted end time (which is now tomorrow)
             if (now >= yesterdayStart && now < yesterdayEnd) {
               isCurrentlyOpen = true;
               minsToClose = Math.floor((yesterdayEnd - now) / 60000);
               minsToOpen = -1; // Not applicable when open from yesterday
               console.log('Currently open from yesterday overnight hours!');
               console.log('Minutes until close:', minsToClose);
             } else {
               console.log('NOT in yesterday overnight hours:');
               console.log('Current time:', now);
               console.log('Yesterday start:', yesterdayStart);
               console.log('Yesterday end (adjusted):', yesterdayEnd);
               console.log('now >= yesterdayStart:', now >= yesterdayStart);
               console.log('now < yesterdayEnd:', now < yesterdayEnd);
               console.log('Time difference (start):', now - yesterdayStart, 'ms');
               console.log('Time difference (end):', yesterdayEnd - now, 'ms');
               
               // After 2:00 AM, we should be closed
               console.log('After 2:00 AM - should be CLOSED');
               
               // Explicitly ensure we're closed after overnight hours end
               isCurrentlyOpen = false;
               minsToClose = -1;
               
               // Calculate time until today opens (if today has hours)
               if (todayLi) {
                 const todayRange = getTimeRange(todayLi.textContent);
                 if (todayRange) {
                   const todayStart = toDateToday(todayRange.start);
                   minsToOpen = Math.floor((todayStart - now) / 60000);
                   console.log('Time until today opens:', minsToOpen, 'minutes');
                 }
               }
             }
           } else {
             console.log('Yesterday was NOT overnight, skipping overnight check');
           }
        }
      }
      
      // If not open from yesterday, check today's hours
      if (!isCurrentlyOpen && todayLi) {
        const todayRange = getTimeRange(todayLi.textContent);
        console.log('Today range:', todayRange);
        if (todayRange) {
          const todayStart = toDateToday(todayRange.start);
          let todayEnd = toDateToday(todayRange.end);
          
          console.log('Today start:', todayStart, 'Today end:', todayEnd);
          
          // Check if today's hours are overnight (close time is before open time)
          const isTodayOvernight = todayEnd <= todayStart;
          if (isTodayOvernight) {
            todayEnd.setDate(todayEnd.getDate() + 1);
            console.log('Today is overnight, adjusted end time:', todayEnd);
          }

          // Check if we're currently in today's hours
          // BUT: If we just finished yesterday's overnight hours, we should still be closed
          // until today's start time, not immediately open
          const isInTodayHours = now >= todayStart && now < todayEnd;
          
          // Only set as open if we're actually within today's hours
          if (isInTodayHours) {
            isCurrentlyOpen = true;
            minsToOpen = Math.floor((todayStart - now) / 60000);
            minsToClose = Math.floor((todayEnd - now) / 60000);
          } else {
            // We're not in today's hours yet
            isCurrentlyOpen = false;
            minsToOpen = Math.floor((todayStart - now) / 60000);
            minsToClose = -1;
          }
          
          console.log('Today hours check:');
          console.log('  Today start:', todayStart.toISOString());
          console.log('  Today end (adjusted):', todayEnd.toISOString());
          console.log('  Current time:', now.toISOString());
          console.log('  now >= todayStart:', now >= todayStart);
          console.log('  now < todayEnd:', now < todayEnd);
          console.log('  isInTodayHours:', isInTodayHours);
          console.log('  Currently open today:', isCurrentlyOpen);
        }
      }
      
      if (!todayLi && !yesterdayLi) {
        console.log('No hours found for today or yesterday, skipping panel');
        return;
      }

      // Debug: Show final status decision
      console.log(`=== FINAL STATUS FOR PANEL ${i} ===`);
      console.log('isCurrentlyOpen:', isCurrentlyOpen);
      console.log('minsToOpen:', minsToOpen);
      console.log('minsToClose:', minsToClose);
      console.log('Current time:', now.toISOString());
      console.log('===============================');

      const openEl = panel.querySelector(`#opensign-loc-${i}`);
      const closeEl = panel.querySelector(`#closedsign-loc-${i}`);
      const soonOpenEl = panel.querySelector(`#soonopen-loc-${i}`);
      const soonCloseEl = panel.querySelector(`#soonclose-loc-${i}`);
      
      console.log('Status elements found:', { openEl, closeEl, soonOpenEl, soonCloseEl });

      [openEl, closeEl, soonOpenEl, soonCloseEl].forEach(el => el?.classList.add("hide"));

      if (isCurrentlyOpen) {
        if (minsToClose <= 30) {
          soonCloseEl?.classList.remove("hide");
          console.log('Showing closes soon');
        } else {
          openEl?.classList.remove("hide");
          console.log('Showing open');
        }
      } else if (minsToOpen > 0 && minsToOpen <= 30) {
        soonOpenEl?.classList.remove("hide");
        console.log('Showing opens soon');
      } else {
        closeEl?.classList.remove("hide");
        console.log('Showing closed');
      }

      // Add status tag to today-hours
      const todayShort = hours.querySelector(".today-hours li[data-day]");
      if (todayShort) {
        todayShort.querySelector(".status-badge")?.remove(); // remove old
        const tag = document.createElement("span");
        tag.classList.add("status-badge");

        if (isCurrentlyOpen) {
          if (minsToClose <= 30) {
            tag.textContent = "Closes Soon";
            tag.classList.add("soon-close");
          } else {
            tag.textContent = "Open";
            tag.classList.add("open");
          }
        } else if (minsToOpen > 0 && minsToOpen <= 30) {
          tag.textContent = "Opens Soon";
          tag.classList.add("soon-open");
        } else {
          tag.textContent = "Closed";
          tag.classList.add("closed");
        }

        todayShort.prepend(tag);
        console.log('Added status badge:', tag.textContent);
      }
    });
  }

  console.log('Starting updateStatus and interval');
  updateStatus();
  if (window._ttmsOpenSignsInterval) {
    clearInterval(window._ttmsOpenSignsInterval);
  }
  window._ttmsOpenSignsInterval = setInterval(updateStatus, 60000);
}

function reinitOpeningHours() {
  initOpeninghoursDisplay();
  getOpenSigns();
}

window.reinitOpeningHours = reinitOpeningHours;

if (window.TTMSBarba) {
  window.TTMSBarba.register(reinitOpeningHours);
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', function () {
    if (window.TTMSBarba) {
      window.TTMSBarba.register(reinitOpeningHours);
    }
  });
}

// ========================================
// DEBUGGING FUNCTIONS
// ========================================

// Test function to simulate different times for debugging
function testOvernightScenario() {
  console.log('=== TESTING OVERNIGHT SCENARIO ===');
  
  // Test current time
  const now = new Date();
  console.log('Current time:', now);
  console.log('Current day:', now.getDay());
  console.log('Current hour:', now.getHours());
  
  // Test yesterday calculation
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const todayIndex = now.getDay();
  const yesterdayIndex = (todayIndex - 1 + 7) % 7;
  console.log('Today index:', todayIndex, 'Yesterday index:', yesterdayIndex);
  console.log('Today:', days[todayIndex], 'Yesterday:', days[yesterdayIndex]);
  
  // Test if we can find the elements
  const panels = document.querySelectorAll(".location-card");
  console.log('Found panels:', panels.length);
  
  panels.forEach((panel, i) => {
    const hours = panel.querySelector(".hours");
    if (!hours) return;
    const allHoursList = hours?.querySelector(".all-hours");
    const todayLi = allHoursList?.querySelector(`li[data-day="${days[todayIndex]}"]`);
    const yesterdayLi = allHoursList?.querySelector(`li[data-day="${days[yesterdayIndex]}"]`);
    
    console.log(`Panel ${i}:`);
    console.log('  Today hours:', todayLi?.textContent);
    console.log('  Yesterday hours:', yesterdayLi?.textContent);
  });
}

// Make test function globally available
window.testOvernightScenario = testOvernightScenario;
