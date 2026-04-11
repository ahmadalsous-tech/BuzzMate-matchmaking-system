let currentUserId = localStorage.getItem('currentUserId') || null;

const API_BASE = 'http://localhost:3000';
// Tracks which candidate userIds the current user has already swiped on
// during this browser session (Map<targetUserId: number, action: 'like'|'dislike'>).
// Cleared on page reload / new login. The backend has its own idempotency
// guard, but this client-side map lets us update the UI instantly without
// a round-trip and survive re-renders of the discover grid.
const swipedThisSession = new Map();
// Initialize session if exists
if (currentUserId) {
  // Execute immediately to prevent split-second flash of landing page
  document.getElementById('page-landing').classList.remove('active');
  document.getElementById('page-landing').classList.add('hidden');
  document.getElementById('page-signup').classList.remove('active');
  document.getElementById('page-signup').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');

  loadCurrentUser().then((isValid) => {
    if (isValid === false) return; // session was invalid and was cleared
    loadPreferences().then(() => {
      document.querySelector('[data-page="discover"]').click();
    }).catch(() => {
      document.querySelector('[data-page="discover"]').click();
    });
    startMatchPolling();
  });
}

function logoutUser() {
  stopMatchPolling();
  _knownMatchIds.clear();
  currentUserId = null;
  localStorage.removeItem('currentUserId');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('page-landing').classList.remove('hidden');
  document.getElementById('page-landing').classList.add('active');
}

// Page navigation logic
document.querySelectorAll('.nav-item').forEach((btn) => {
  if (btn.classList.contains('logout')) return; // Skip logout button
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item:not(.logout)').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const pageId = e.currentTarget.getAttribute('data-page');
    document.querySelectorAll('main .page').forEach(p => p.classList.remove('active'));

    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) targetPage.classList.add('active', 'flex');

    if (pageId === 'discover') loadDiscover();
    if (pageId === 'chats') loadChats();
    if (pageId === 'calendar') loadDates();
  });
});

function showMainApp() {
  document.getElementById('page-landing').classList.remove('active');
  document.getElementById('page-landing').classList.add('hidden');
  document.getElementById('page-signup').classList.remove('active');
  document.getElementById('page-signup').classList.add('hidden');
  document.getElementById('main-app').classList.remove('hidden');
  loadCurrentUser().then((isValid) => {
    if (isValid === false) return; // session was invalid
    loadPreferences().then(() => {
      document.querySelector('[data-page="discover"]').click();
    }).catch(() => {
      document.querySelector('[data-page="discover"]').click();
    });
    startMatchPolling(); // begin watching for incoming buzz-backs
  });
}


// --- New UI Helpers ---
window.setGenderPref = function (val, btn) {
  document.getElementById('preferredGender').value = val;
  document.querySelectorAll('#gender-btns button').forEach(b => {
    b.className = "flex-1 py-4 px-6 rounded-full bg-surface-container-highest text-secondary font-bold whitespace-nowrap hover:bg-surface-variant transition-colors";
  });
  btn.className = "flex-1 py-4 px-6 rounded-full bg-tertiary-container text-on-tertiary-container font-bold whitespace-nowrap shadow-sm";
};

window.setMoodPref = function (val, btn) {
  document.getElementById('dateMood').value = val;
  document.querySelectorAll('#mood-btns button').forEach(b => {
    b.className = "p-4 rounded-xl bg-surface-container-low border-2 border-transparent text-secondary font-semibold text-center hover:bg-surface-container-high transition-all";
  });
  btn.className = "p-4 rounded-xl bg-tertiary-container/10 border-2 border-tertiary-container text-on-tertiary-container font-bold text-center";
};

window.updatePriceDisplay = function (val) {
  const spans = document.querySelectorAll('#price-display span');
  spans.forEach((span, idx) => {
    if (idx < val) {
      span.className = "text-2xl font-black text-primary";
    } else {
      span.className = "text-2xl font-black text-outline-variant";
    }
  });
};

window.openChat = async function (convId, name, img, otherUserId) {
  // Reveal chat pane on mobile directly if hidden
  const rightPane = document.querySelector('#page-chats > div:nth-child(2)');
  if (rightPane) {
    rightPane.classList.remove('hidden');
    rightPane.classList.add('flex');
  }

  // Assign active background to the selected chat in the left list
  document.querySelectorAll('#chat-list > div').forEach(div => {
    div.classList.remove('bg-[#e4ddc0]');
  });
  const activeDiv = document.querySelector(`#chat-list > div[data-convid="${convId}"]`);
  if (activeDiv) activeDiv.classList.add('bg-[#e4ddc0]');

  document.getElementById('active-chat-name').innerText = name;
  document.getElementById('active-chat-img').src = img;
  const container = document.getElementById('messages-container');
  container.innerHTML = `<p class="text-center text-secondary italic">Loading messages...</p>`;

  // Save state globally for sending and moderation
  window.currentConversationId = convId;
  window.currentChatName = name;
  window.currentChatImg = img;
  window.currentChatOtherUserId = otherUserId || null;

  try {
    // Add cache buster to force fresh data from backend that includes our newly added senderId column!
    const res = await fetch(`${API_BASE}/messaging/conversation/${convId}/messages?t=${new Date().getTime()}`);
    const messages = await res.json();
    const myImgUrl = document.getElementById('sidebar-img')?.src || '/assets/BeeProfileIcon.png';

    container.innerHTML = `
            <div class="flex justify-center my-4">
                <span class="px-4 py-1 bg-surface-container-high rounded-full text-[10px] font-bold text-secondary uppercase tracking-widest">Matched recently</span>
            </div>
        `;

    if (messages.length === 0) {
      container.innerHTML += `<p class="text-center text-secondary italic">Say hi to ${name}!</p>`;
    } else {
      messages.forEach(msg => {
        const senderId = msg.senderId;
        // Coerce both to numbers to guarantee strict match (e.g. 1 === 1)
        const isMine = Number(senderId) === Number(currentUserId);
        if (isMine) {
          container.innerHTML += `
                        <div style="display:flex;align-items:flex-end;justify-content:flex-end;width:100%;" class="animate-fade-in">
                            <div class="honey-gradient text-white px-3 py-2 rounded-3xl rounded-br-sm max-w-[70%] shadow-md">
                                <p class="text-sm font-medium leading-relaxed">${msg.messageBody}</p>
                            </div>
                        </div>
                    `;
        } else {
          container.innerHTML += `
                        <div style="display:flex;align-items:flex-end;justify-content:flex-start;width:100%;" class="animate-fade-in">
                            <div class="bg-white text-on-surface px-3 py-2 rounded-3xl rounded-bl-sm max-w-[70%] shadow-sm border border-outline-variant/30">
                                <p class="text-sm font-medium leading-relaxed">${msg.messageBody}</p>
                            </div>
                        </div>
                    `;
        }
      });
    }
    setTimeout(() => {
      container.parentElement.scrollTop = container.parentElement.scrollHeight;
    }, 50);
  } catch (e) {
    console.error(e);
    container.innerHTML = `<p class="text-center text-error italic">Failed to load messages.</p>`;
  }
};

window.sendMessageContent = async function () {
  if (!window.currentConversationId) return;
  const inputEl = document.getElementById('chat-input-box');
  const msg = inputEl.value.trim();
  if (!msg) return;

  try {
    const res = await fetch(`${API_BASE}/messaging/conversation/${window.currentConversationId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: Number(currentUserId), messageBody: msg })
    });
    if (res.ok) {
      inputEl.value = '';
      // Refresh current chat view
      await openChat(window.currentConversationId, window.currentChatName, window.currentChatImg);
      loadChats(); // refresh preview in side panel
    }
  } catch (e) {
    console.error(e);
  }
};

// Auth UI Logic

function openAuthOverlay(mode) {
  if (mode === 'signup') {
    document.getElementById('page-landing').classList.remove('active');
    document.getElementById('page-landing').classList.add('hidden');
    document.getElementById('page-signup').classList.remove('hidden');
    document.getElementById('page-signup').classList.add('active', 'flex');
  } else {
    document.getElementById('page-signup').classList.remove('active', 'flex');
    document.getElementById('page-signup').classList.add('hidden');
    document.getElementById('page-landing').classList.remove('hidden');
    document.getElementById('page-landing').classList.add('active', 'flex');
  }
}

function closeAuthOverlay() {
  openAuthOverlay('login');
}

async function submitAuth(mode) {
  if (mode === 'signup') {
    await registerUser();
  } else {
    await loginUser();
  }
}

async function loadCurrentUser() {
  if (!currentUserId) return false;
  try {
    const res = await fetch(`${API_BASE}/users/${currentUserId}`);
    if (!res.ok) {
      logoutUser();
      return false;
    }
    const user = await res.json();

    const sidebarName = document.getElementById('sidebar-name');
    const sidebarOcc = document.getElementById('sidebar-occ');
    const sidebarImg = document.getElementById('sidebar-img');

    if (sidebarName) {
      sidebarName.innerText = `${user.name || 'New Bee'}, ${user.age || ''}`.trim();
    }
    if (sidebarOcc) {
      sidebarOcc.innerText = user.occupation || 'Just joined';
    }
    if (sidebarImg) {
      sidebarImg.src = user.profilePicUrl || '/assets/BeeProfileIcon.png';
    }

    const emailInput = document.getElementById('email');
    const nameInput = document.getElementById('name');
    const ageInput = document.getElementById('age');
    const occInput = document.getElementById('occupation');
    const datingPrefSelect = document.getElementById('datingPreference');

    if (emailInput) emailInput.value = user.email || '';
    if (nameInput) nameInput.value = user.name || '';
    if (ageInput) ageInput.value = user.age != null ? user.age : '';
    if (occInput) occInput.value = user.occupation || '';
    if (datingPrefSelect && user.datingPreference) {
      datingPrefSelect.value = user.datingPreference;
    }

    const addressInput = document.getElementById('address');
    const phoneInput = document.getElementById('phoneNumber');
    const privacyInput = document.getElementById('privacySetting');

    if (addressInput) addressInput.value = user.address || '';
    if (phoneInput) phoneInput.value = user.phoneNumber || '';
    if (privacyInput && user.privacySetting) privacyInput.value = user.privacySetting;

    return true;
  } catch (err) {
    console.error('Failed to load current user', err);
    return false;
  }
}

async function loginUser() {
  const email = document.getElementById('auth-email-login').value;
  try {
    const res = await fetch(`${API_BASE}/users/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (!res.ok) {
      const data = await res.json();
      alert(data.message || "Login failed. Are you sure you signed up?");
      return;
    }

    const user = await res.json();
    currentUserId = user.userId;
    localStorage.setItem('currentUserId', currentUserId);

    await loadCurrentUser();
    await loadPreferences();

    showMainApp();
  } catch (err) {
    console.error(err);
    alert("Server error during login.");
  }
}

async function registerUser() {
  const email = document.getElementById('auth-email-signup').value;
  const name = document.getElementById('auth-name').value;
  const age = Number(document.getElementById('auth-age').value) || 18;
  const gender = document.getElementById('auth-gender').value;
  const occupation = document.getElementById('auth-occupation')?.value || '';
  const datingPreference = document.getElementById('auth-dating-preference')?.value || 'unsure';

  // New fields from onboarding
  const address = document.getElementById('auth-address')?.value || '';
  const phoneNumber = document.getElementById('auth-phone')?.value || '';
  const privacySetting = document.querySelector('input[name="privacy"]:checked')?.value || 'public';

  try {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, age, gender, datingPreference, occupation, address, phoneNumber, privacySetting })
    });

    if (!res.ok) {
      alert("Registration failed. Are you banned?");
      return;
    }

    const user = await res.json();
    currentUserId = user.userId;
    localStorage.setItem('currentUserId', currentUserId);

    document.getElementById('email').value = user.email || email;
    document.getElementById('name').value = user.name || name;
    document.getElementById('age').value = user.age || age;
    if (document.getElementById('sidebar-name')) document.getElementById('sidebar-name').innerText = `${user.name || name}, ${user.age || age}`;

    // Automatically spool up a preferences record 
    await savePreferences(true);
    await loadCurrentUser();
    await loadPreferences();

    showMainApp();
    // Move slightly forward to preferences initially to allow users to build their parameters natively
    setTimeout(() => {
      document.querySelector('[data-page="preferences"]').click();
    }, 100);
  } catch (err) {
    console.error(err);
    alert("Server error during registration.");
  }
}

async function saveProfile() {
  const email = document.getElementById('email').value;
  const name = document.getElementById('name').value;
  const age = Number(document.getElementById('age').value);
  const occupation = document.getElementById('occupation').value;
  const datingPreference = document.getElementById('datingPreference').value;
  const address = document.getElementById('address')?.value || '';
  const phoneNumber = document.getElementById('phoneNumber')?.value || '';
  const privacySetting = document.getElementById('privacySetting')?.value || 'public';

  if (!currentUserId) {
    if (!email || !name || !age) return alert("Email, name, and age required");
    try {
      const res = await fetch(`${API_BASE}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, age, gender: document.getElementById('auth-gender')?.value || 'other', datingPreference, occupation, address, phoneNumber, privacySetting })
      });
      if (!res.ok) return alert("Failed to register.");
      const user = await res.json();
      currentUserId = user.userId;
      localStorage.setItem('currentUserId', currentUserId);
      await savePreferences(true);
      document.getElementById('sidebar-name').innerText = `${name}, ${age}`;
      document.getElementById('sidebar-occ').innerText = occupation;
      alert("Profile created successfully!");
    } catch (e) { console.error(e); }
  } else {
    try {
      await fetch(`${API_BASE}/users/${currentUserId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, age, occupation, datingPreference, address, phoneNumber, privacySetting })
      });
      await savePreferences(true); // synchronize opener
      await loadCurrentUser();
      document.getElementById('sidebar-name').innerText = `${name}, ${age}`;
      document.getElementById('sidebar-occ').innerText = occupation;
      alert("Profile updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to save profile.");
    }
  }
}

async function uploadProfilePicOnboarding() {
  if (!currentUserId) return alert("Please finish creating your profile by clicking 'Next Step' first!");
  const fileInput = document.getElementById('auth-profile-pic');
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/users/${currentUserId}/upload-picture`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.profilePicUrl) {
      if (document.getElementById('sidebar-img')) document.getElementById('sidebar-img').src = data.profilePicUrl;
      alert("Profile picture uploaded!");
    }
  } catch (err) {
    console.error(err);
    alert("Failed to upload picture.");
  }
}

async function uploadProfilePic() {
  if (!currentUserId) return alert("Please save your profile first to get an ID!");
  const fileInput = document.getElementById('profilePicInput');
  const file = fileInput.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('file', file);

  try {
    const res = await fetch(`${API_BASE}/users/${currentUserId}/upload-picture`, {
      method: 'POST',
      body: formData
    });
    const data = await res.json();
    if (data.profilePicUrl) {
      document.getElementById('sidebar-img').src = data.profilePicUrl;
      alert("Profile picture uploaded!");
    }
  } catch (err) {
    console.error(err);
    alert("Failed to upload picture.");
  }
}

async function connectGoogleCalendarOnboarding() {
  if (!currentUserId) {
    return alert("Please finish creating your profile by clicking 'Next Step' before connecting your calendar.");
  }
  await connectGoogleCalendar();
}

async function connectGoogleCalendar() {
  if (!currentUserId) return alert("Please save your profile first before connecting Calendar!");

  // Synchronous popup block-bypass
  const popup = window.open('', 'google_auth', 'width=500,height=600');

  try {
    const res = await fetch(`${API_BASE}/users/auth/google/url?userId=${currentUserId}`);
    const data = await res.json();
    if (data.url && popup) {
      popup.location.href = data.url;
      // Note: we can't reliably detect when the user finishes OAuth from a cross-origin popup,
      // but the callback redirects to a script that runs `window.close()`.
    } else if (popup) {
      popup.close();
      alert("Failed to get auth URL");
    }
  } catch (err) {
    if (popup) popup.close();
    console.error(err);
    alert("Error fetching Google Auth URL.");
  }
}

async function savePreferences(silent = false) {
  if (!currentUserId) return;

  const selectedHobbies = Array.from(document.querySelectorAll('#hobbies-container input[type="checkbox"]:checked')).map(cb => cb.value);
  const preferences = {
    minAge: Number(document.getElementById('minAge').value) || 18,
    maxAge: Number(document.getElementById('maxAge').value) || 99,
    maxDistance: Number(document.getElementById('maxDistance').value) || 50,
    preferredGender: document.getElementById('preferredGender').value || 'any',
    dateMood: document.getElementById('dateMood').value || 'unsure',
    maxPriceTier: Number(document.getElementById('maxPriceTier').value) || 3,
    hobbies: selectedHobbies,
    opener: document.getElementById('opener').value
  };

  try {
    await fetch(`${API_BASE}/preferences/${currentUserId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(preferences)
    });
    await loadPreferences();
    if (!silent) alert("Preferences saved!");
  } catch (err) {
    console.error(err);
  }
}

async function loadPreferences() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/preferences/${currentUserId}`);
    if (!res.ok) return;
    const pref = await res.json();

    const minAgeInput = document.getElementById('minAge');
    const maxAgeInput = document.getElementById('maxAge');
    const maxDistanceInput = document.getElementById('maxDistance');
    const preferredGenderSelect = document.getElementById('preferredGender');
    const dateMoodSelect = document.getElementById('dateMood');
    const maxPriceTierInput = document.getElementById('maxPriceTier');
    const openerTextarea = document.getElementById('opener');
    const sidebarBio = document.getElementById('sidebar-bio');

    if (minAgeInput && pref.minAge != null) minAgeInput.value = pref.minAge;
    if (maxAgeInput && pref.maxAge != null) maxAgeInput.value = pref.maxAge;
    if (maxDistanceInput && pref.maxDistance != null) maxDistanceInput.value = pref.maxDistance;
    if (preferredGenderSelect && pref.preferredGender) {
      preferredGenderSelect.value = pref.preferredGender;
      document.querySelectorAll('#gender-btns button').forEach(b => {
        if (b.innerText.toLowerCase() === pref.preferredGender.toLowerCase() || (pref.preferredGender === 'any' && b.innerText === 'Any')) {
          b.className = "flex-1 py-4 px-6 rounded-full bg-tertiary-container text-on-tertiary-container font-bold whitespace-nowrap shadow-sm";
        } else {
          b.className = "flex-1 py-4 px-6 rounded-full bg-surface-container-highest text-secondary font-bold whitespace-nowrap hover:bg-surface-variant transition-colors";
        }
      });
    }
    if (dateMoodSelect && pref.dateMood) {
      dateMoodSelect.value = pref.dateMood;
      document.querySelectorAll('#mood-btns button').forEach(b => {
        if (b.innerText.toLowerCase() === pref.dateMood.toLowerCase()) {
          b.className = "p-4 rounded-xl bg-tertiary-container/10 border-2 border-tertiary-container text-on-tertiary-container font-bold text-center";
        } else {
          b.className = "p-4 rounded-xl bg-surface-container-low border-2 border-transparent text-secondary font-semibold text-center hover:bg-surface-container-high transition-all";
        }
      });
    }
    if (maxPriceTierInput && pref.maxPriceTier != null) {
      maxPriceTierInput.value = pref.maxPriceTier;
      updatePriceDisplay(pref.maxPriceTier);
    }
    if (document.getElementById('distanceLabel') && pref.maxDistance != null) document.getElementById('distanceLabel').innerText = pref.maxDistance + ' miles';

    if (openerTextarea) openerTextarea.value = pref.opener || '';
    if (sidebarBio) sidebarBio.innerText = pref.opener || 'Passionate about finding my match!';

    const hobbiesContainer = document.getElementById('hobbies-container');
    if (hobbiesContainer && Array.isArray(pref.hobbies)) {
      const checkboxes = hobbiesContainer.querySelectorAll('input[type=\"checkbox\"]');
      checkboxes.forEach((cb) => {
        cb.checked = pref.hobbies.includes(cb.value);
      });
    }
  } catch (err) {
    console.error('Failed to load preferences', err);
  }
}

let windowLastRegenExpiresAt = null;
let regenToastTimeout = null;

window.handleToastScroll = function() {
    window.hideRegenToast();
}

window.showRegenToast = function() {
    const toast = document.getElementById('regen-toast');
    if (!toast) return;
    toast.classList.remove('opacity-0', 'pointer-events-none', 'translate-y-[-20px]');
    toast.classList.add('opacity-100', 'translate-y-0', 'pointer-events-auto');
    
    if (regenToastTimeout) clearTimeout(regenToastTimeout);
    regenToastTimeout = setTimeout(window.hideRegenToast, 5000);
    
    // Add scroll dismiss
    window.addEventListener('scroll', window.handleToastScroll, true);
}

window.hideRegenToast = function() {
    const toast = document.getElementById('regen-toast');
    if (!toast) return;
    toast.classList.remove('opacity-100', 'translate-y-0', 'pointer-events-auto');
    toast.classList.add('opacity-0', 'pointer-events-none', 'translate-y-[-20px]');
    
    window.removeEventListener('scroll', window.handleToastScroll, true);
}

async function loadDiscover() {
  if (!currentUserId) return;
  try {
    let res = await fetch(`${API_BASE}/discover/${currentUserId}`);
    let resJson = await res.json();
    let candidates = Array.isArray(resJson) ? resJson : (resJson.candidates || []);
    let serverExpiresAt = resJson.expiresAt || null;
    const discoverCard = document.getElementById('discover-card');
    
    let isAutoRegenerated = false;

    if (!candidates || candidates.length === 0) {
      // Auto-regenerate and try again once
      await fetch(`${API_BASE}/discover/${currentUserId}/regenerate`, { method: 'POST' });
      res = await fetch(`${API_BASE}/discover/${currentUserId}`);
      resJson = await res.json();
      candidates = Array.isArray(resJson) ? resJson : (resJson.candidates || []);
      serverExpiresAt = resJson.expiresAt || null;
      isAutoRegenerated = true;

      if (!candidates || candidates.length === 0) {
        discoverCard.innerHTML = `<div class="col-span-full text-center text-secondary italic">No fresh matches in your hive. Try expanding your preferences.</div>`;
        return;
      }
    }
    
    if (isAutoRegenerated || (windowLastRegenExpiresAt !== null && windowLastRegenExpiresAt !== serverExpiresAt)) {
        window.showRegenToast();
    }
    if (serverExpiresAt) {
        windowLastRegenExpiresAt = serverExpiresAt;
    }

    if (serverExpiresAt) {
      updateRegenerationTimer(serverExpiresAt);
    }
    discoverCard.innerHTML = candidates.map(c => {
    const alreadySwiped = swipedThisSession.has(c.userId);
    const swipedAction = swipedThisSession.get(c.userId); // 'like' | 'dislike'
    const isBuzz = swipedAction === 'like';
    const passBtn = `
        <button
          id="btn-dislike-${c.userId}"
          class="flex-1 bg-surface-container-high text-secondary font-bold py-3 rounded-full flex items-center justify-center gap-2 hover:bg-surface-variant transition-all ${alreadySwiped ? 'opacity-40 cursor-not-allowed' : ''}"
          onclick="swipe(${c.userId}, 'dislike')"
          ${alreadySwiped ? 'disabled' : ''}
        >
          <span class="material-symbols-outlined">close</span> Pass
        </button>`;
 
    const buzzBtn = `
        <button
          id="btn-buzz-${c.userId}"
          class="flex-1 honey-gradient text-on-primary-fixed font-bold py-3 rounded-full flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all ${alreadySwiped ? 'opacity-40 cursor-not-allowed' : ''}"
          onclick="swipe(${c.userId}, 'like')"
          ${alreadySwiped ? 'disabled' : ''}
        >
          <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">hive</span> Buzz
        </button>`;
    const swipedOverlay = alreadySwiped ? `
        <div class="absolute inset-0 bg-surface-container-lowest/70 backdrop-blur-sm flex items-center justify-center rounded-xl z-10 pointer-events-none">
          <span class="px-4 py-2 rounded-full font-bold text-sm ${isBuzz ? 'bg-primary text-on-primary' : 'bg-surface-variant text-secondary'}">
            ${isBuzz ? '🐝 Buzzed!' : '✕ Passed'}
          </span>
        </div>` : '';
 
    return `
    <article class="group bg-surface-container-lowest rounded-xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col relative">
      ${swipedOverlay}
      <div class="relative h-72 overflow-hidden">
          <img alt="${c.name}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" src="${c.profilePicUrl || '/assets/BeeProfileIcon.png'}">
          <div class="absolute bottom-4 left-4 right-4">
            <span class="bg-surface-container-lowest/80 backdrop-blur-md px-3 py-1 rounded-full text-xs font-bold text-primary flex items-center w-fit gap-1">
              
             <span class="material-symbols-outlined text-[14px]">location_on</span> ${c.distance ? c.distance + ' miles away' : 'Nearby'}
            </span>
          </div>
      </div>
      <div class="p-6 flex-1 flex flex-col">
          <div class="mb-4">
              <h4 class="text-2xl font-headline font-extrabold text-on-surface">${c.name}, ${c.age}</h4>
              <p class="text-secondary text-sm mt-2 line-clamp-2 italic">${c.preferences && c.preferences.opener ? c.preferences.opener : 'Looking for my match!'}</p>
          </div>
          <div class="flex flex-wrap gap-2 mb-6">
                  ${(c.preferences && c.preferences.hobbies ? c.preferences.hobbies : []).slice(0, 3).map(h => `<span class="px-3 py-1 bg-surface-container-low text-xs font-medium rounded-full capitalize">${h}</span>`).join('')}
          </div>
          <div class="mt-auto flex gap-2">
                  ${passBtn}
                  ${buzzBtn}
          </div>
      </div>
    </article>`;
    }).join('');
  } catch (e) {
    console.error(e);
  }
}

async function swipe(targetId, type) {
  if (!currentUserId) return;
 
  // Prevent duplicate swipes within the same session (belt-and-suspenders
  // alongside the backend idempotency guard)
  if (swipedThisSession.has(targetId)) return;
 
  // Immediately disable both buttons on this card so the user can't
  // double-tap while the request is in-flight
  const passBtn = document.getElementById(`btn-dislike-${targetId}`);
  const buzzBtn = document.getElementById(`btn-buzz-${targetId}`);
  if (passBtn) passBtn.disabled = true;
  if (buzzBtn) buzzBtn.disabled = true;
 
  try {
    const res = await fetch(`${API_BASE}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: Number(currentUserId), receiverId: targetId, actionType: type })
    });
 
    if (!res.ok) {
      // Re-enable buttons if the request failed so user can retry
      if (passBtn) passBtn.disabled = false;
      if (buzzBtn) buzzBtn.disabled = false;
      alert('Something went wrong. Please try again.');
      return;
    }

    const data = await res.json();
 
    // Record in session map so the card stays visually locked on re-render
    swipedThisSession.set(targetId, type);
 
    // Update this card's UI in-place without refetching the whole list
    const isBuzz = type === 'like';
    const card = passBtn?.closest('article');
    if (card) {
      card.querySelector('.swiped-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'swiped-overlay absolute inset-0 bg-surface-container-lowest/70 backdrop-blur-sm flex items-center justify-center rounded-xl z-10 pointer-events-none';
      overlay.innerHTML = `
        <span class="px-4 py-2 rounded-full font-bold text-sm ${isBuzz ? 'bg-primary text-on-primary' : 'bg-surface-variant text-secondary'}">
          ${isBuzz ? '🐝 Buzzed!' : '✕ Passed'}
        </span>`;
      card.appendChild(overlay);
      if (passBtn) passBtn.classList.add('opacity-40', 'cursor-not-allowed');
      if (buzzBtn) buzzBtn.classList.add('opacity-40', 'cursor-not-allowed');
    }

    // If the backend signals a mutual match, show the celebration modal.
    // Otherwise show the subtle buzz confirmation.
    if (data.match) {
      // Find the matched user's card info from the DOM to populate the modal avatars
      const theirAvatar = card?.querySelector('img')?.src || 'https://i.pravatar.cc/150';
      const theirName   = card?.querySelector('h4')?.textContent?.replace(/,.*/, '').trim() || 'them';
      openMatchModal(theirName, theirAvatar, data.match.matchId);
    } else if (type === 'like') {
      // Non-match buzz: subtle toast is enough, no blocking alert
      showRegenToast('🐝 Buzzed! Waiting to see if they buzz back…');
      setTimeout(hideRegenToast, 3000);
    }
    // Dislike: always silent
 
  } catch (e) {
    console.error(e);
    if (passBtn) passBtn.disabled = false;
    if (buzzBtn) buzzBtn.disabled = false;
  }
}
// ---------------------------------------------------------------------------
// Match polling — detects when the *other* user buzzes back while the current
// user is already on the discover page.  Uses GET /matches/user/:id every 12s
// and shows the modal for any matchId not seen in this session.
// ---------------------------------------------------------------------------
// matchId is stored so "Start Buzzing" can navigate straight to that conversation
let   _matchPollInterval = null;
const _knownMatchIds     = new Set();
async function _initKnownMatches() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/matches/user/${currentUserId}`);
    if (!res.ok) return;
    const matches = await res.json();
    matches.forEach(m => _knownMatchIds.add(m.matchId));
  } catch (_) {}
}

async function _pollForNewMatches() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/matches/user/${currentUserId}`);
    if (!res.ok) return;
    const matches = await res.json();
    for (const m of matches) {
      if (!_knownMatchIds.has(m.matchId)) {
        _knownMatchIds.add(m.matchId);
        // Determine which user is the other person
        const other = Number(m.user1Id) === Number(currentUserId) ? m.user2 : m.user1;
        openMatchModal(
          other.name,
          other.profilePicUrl || '/assets/BeeProfileIcon.png',
          m.matchId
        );
        break; // Show one at a time; next poll will catch any additional ones
      }
    }
  } catch (_) {}
}

function startMatchPolling() {
  if (_matchPollInterval) return; // Already running
  _initKnownMatches().then(() => {
    _matchPollInterval = setInterval(_pollForNewMatches, 12000);
  });
}
 
function stopMatchPolling() {
  if (_matchPollInterval) {
    clearInterval(_matchPollInterval);
    _matchPollInterval = null;
  }
}




async function loadChats() {
  if (!currentUserId) return;
  const chatList = document.getElementById('chat-list');
  try {
    const res = await fetch(`${API_BASE}/messaging/user/${currentUserId}/conversations`);
    if (!res.ok) return;
    const conversations = await res.json();

    if (!conversations || conversations.length === 0) {
      chatList.innerHTML = `<div class="text-center text-secondary italic mt-8">No conversations yet. Buzz some profiles!</div>`;
      return;
    }

    chatList.innerHTML = conversations.map(c => {
      const m = c.match;
      const other = m.user1.userId == currentUserId ? m.user2 : m.user1;
      const preview = c.lastMessagePreview || 'No messages yet';
      const isActive = window.currentConversationId === c.conversationId ? 'bg-[#e4ddc0]' : 'hover:bg-surface-container-high';
      const escapedName = other.name.replace(/'/g, "\\'");
      const escapedImg = (other.profilePicUrl || '/assets/BeeProfileIcon.png').replace(/'/g, "\\'");
      return `
        <div data-convid="${c.conversationId}" class="${isActive} rounded-xl p-4 flex gap-4 cursor-pointer mb-3 transition-colors" onclick="openChat(${c.conversationId}, '${escapedName}', '${escapedImg}', ${other.userId})">
            <div class="w-14 h-14 hexagon-mask bg-outline-variant p-0.5 relative">
                <img class="w-full h-full object-cover hexagon-mask" src="${other.profilePicUrl || '/assets/BeeProfileIcon.png'}">
            </div>
            <div class="flex-1 min-w-0">
                <div class="flex justify-between items-start">
                    <h4 class="font-bold text-on-surface truncate">${other.name}</h4>
                </div>
                <p class="text-sm text-secondary truncate mt-0.5">${preview}</p>
            </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load chats', e);
  }
}

// =============================================
// BLOCKED USERS TAB
// =============================================

window.switchChatTab = function (tab) {
  const chatList = document.getElementById('chat-list');
  const blockedList = document.getElementById('blocked-list');
  const tabChats = document.getElementById('tab-chats');
  const tabBlocked = document.getElementById('tab-blocked');

  const activeClass = 'px-4 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all bg-primary-container text-on-primary-container shadow-sm';
  const inactiveClass = 'px-4 py-1.5 rounded-full text-[11px] font-extrabold uppercase tracking-[0.1em] transition-all text-secondary hover:text-on-surface';

  if (tab === 'blocked') {
    chatList.classList.add('hidden');
    blockedList.classList.remove('hidden');
    tabChats.className = inactiveClass;
    tabBlocked.className = activeClass;
    loadBlockedUsers();
  } else {
    blockedList.classList.add('hidden');
    chatList.classList.remove('hidden');
    tabChats.className = activeClass;
    tabBlocked.className = inactiveClass;
  }
};

async function loadBlockedUsers() {
  if (!currentUserId) return;
  const blockedList = document.getElementById('blocked-list');
  if (!blockedList) return;

  blockedList.innerHTML = `<div class="flex items-center justify-center py-12">
    <span class="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
  </div>`;

  try {
    const res = await fetch(`${API_BASE}/moderation/blocks/${currentUserId}`);
    if (!res.ok) throw new Error('Failed to fetch blocked users');
    const blocks = await res.json();

    if (!blocks || blocks.length === 0) {
      blockedList.innerHTML = `
        <div class="text-center py-12">
          <span class="material-symbols-outlined text-4xl text-outline-variant mb-3 block">shield</span>
          <p class="text-sm text-secondary italic">No blocked users.</p>
          <p class="text-xs text-outline mt-1">Users you block will appear here.</p>
        </div>`;
      return;
    }

    blockedList.innerHTML = blocks.map(b => {
      const user = b.blocked;
      const escapedName = (user.name || 'Unknown').replace(/'/g, "\\'");
      return `
        <div class="rounded-xl p-4 flex gap-4 items-center mb-3 bg-surface-container-lowest border border-outline-variant/20 shadow-sm">
            <div class="w-14 h-14 hexagon-mask bg-outline-variant p-0.5 relative opacity-60">
                <img class="w-full h-full object-cover hexagon-mask" src="${user.profilePicUrl || '/assets/BeeProfileIcon.png'}" alt="${user.name}">
            </div>
            <div class="flex-1 min-w-0">
                <h4 class="font-bold text-on-surface truncate">${user.name || 'Unknown'}</h4>
                <p class="text-xs text-secondary mt-0.5">Blocked</p>
            </div>
            <button onclick="unblockUser(${user.userId}, '${escapedName}')" class="px-4 py-2 rounded-full bg-error/10 text-error text-xs font-bold hover:bg-error hover:text-on-error transition-all active:scale-95 border border-error/20">
                Unblock
            </button>
        </div>`;
    }).join('');
  } catch (e) {
    console.error('Failed to load blocked users', e);
    blockedList.innerHTML = `<div class="text-center text-error italic mt-8">Failed to load blocked users.</div>`;
  }
}

window.unblockUser = async function (blockedId, name) {
  if (!currentUserId) return;
  if (!confirm(`Unblock ${name}? They'll be able to contact you again and your conversation will be restored.`)) return;

  try {
    const res = await fetch(`${API_BASE}/moderation/unblock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockerId: Number(currentUserId),
        blockedId: Number(blockedId),
      }),
    });

    if (!res.ok) throw new Error('Unblock failed');

    alert(`${name} has been unblocked. Your conversation has been restored.`);
    await loadBlockedUsers();
    await loadChats();
  } catch (e) {
    console.error('Unblock failed:', e);
    alert('Failed to unblock user. Please try again.');
  }
};

// =============================================
// MODERATION MODULE (Report / Block / Unbuzz)
// =============================================

// Toggle the 3-dot chat menu dropdown
window.toggleChatMenu = function (e) {
  if (!window.currentConversationId) return;

  // If already open, close it
  const existing = document.getElementById('chat-menu-dropdown');
  if (existing) { closeChatMenu(); return; }

  // Get button position for anchoring
  const btn = document.getElementById('chat-menu-btn');
  if (!btn) return;
  const rect = btn.getBoundingClientRect();

  // Create click-away scrim (behind dropdown)
  const scrim = document.createElement('div');
  scrim.id = 'chat-menu-scrim';
  scrim.style.cssText = 'position:fixed;inset:0;z-index:9990;';
  scrim.onclick = () => closeChatMenu();
  document.body.appendChild(scrim);

  // Create dropdown menu
  const dropdown = document.createElement('div');
  dropdown.id = 'chat-menu-dropdown';
  dropdown.style.cssText = `position:fixed;z-index:9991;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;`;
  dropdown.className = 'w-56 bg-surface-container-lowest rounded-xl shadow-xl border border-outline-variant/30 overflow-hidden animate-fade-in';
  dropdown.innerHTML = `
    <button onclick="openReportModal()" class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold text-on-surface hover:bg-error-container/10 hover:text-error transition-colors">
      <span class="material-symbols-outlined text-[20px]">flag</span>
      Report User
    </button>
    <button onclick="blockCurrentChatUser()" class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold text-on-surface hover:bg-error-container/10 hover:text-error transition-colors border-t border-outline-variant/20">
      <span class="material-symbols-outlined text-[20px]">block</span>
      Block User
    </button>
    <button onclick="unbuzzCurrentMatch()" class="w-full flex items-center gap-3 px-5 py-3.5 text-left text-sm font-semibold text-on-surface hover:bg-tertiary-container/20 hover:text-tertiary transition-colors border-t border-outline-variant/20">
      <span class="material-symbols-outlined text-[20px]">heart_broken</span>
      Unbuzz (Unmatch)
    </button>
  `;
  document.body.appendChild(dropdown);
};

function closeChatMenu() {
  const dropdown = document.getElementById('chat-menu-dropdown');
  if (dropdown) dropdown.remove();
  const scrim = document.getElementById('chat-menu-scrim');
  if (scrim) scrim.remove();
}

// --- Report Modal ---
window.openReportModal = function () {
  closeChatMenu();
  if (!window.currentChatOtherUserId) {
    alert('Please select a chat first.');
    return;
  }
  const modal = document.getElementById('report-modal');
  const nameEl = document.getElementById('report-modal-name');
  const input = document.getElementById('report-reason-input');
  if (nameEl) nameEl.textContent = window.currentChatName || 'User';
  if (input) input.value = '';
  document.querySelectorAll('.report-reason-btn').forEach(b => {
    b.className = 'report-reason-btn px-4 py-2 rounded-full bg-surface-container-high text-secondary text-xs font-bold hover:bg-surface-variant transition-colors';
  });
  if (modal) modal.classList.remove('hidden');
};

window.closeReportModal = function () {
  const modal = document.getElementById('report-modal');
  if (modal) modal.classList.add('hidden');
};

window.setReportReason = function (reason, btn) {
  const input = document.getElementById('report-reason-input');
  if (input) input.value = reason;
  document.querySelectorAll('.report-reason-btn').forEach(b => {
    b.className = 'report-reason-btn px-4 py-2 rounded-full bg-surface-container-high text-secondary text-xs font-bold hover:bg-surface-variant transition-colors';
  });
  btn.className = 'report-reason-btn px-4 py-2 rounded-full bg-tertiary-container text-on-tertiary-container text-xs font-bold shadow-sm';
};

window.submitReport = async function () {
  if (!currentUserId || !window.currentChatOtherUserId) return;
  const reason = document.getElementById('report-reason-input')?.value?.trim();
  if (!reason) {
    alert('Please select or type a reason for your report.');
    return;
  }

  const submitBtn = document.getElementById('report-submit-btn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[16px]">progress_activity</span>';
  }

  try {
    const res = await fetch(`${API_BASE}/moderation/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        reporterId: Number(currentUserId),
        reportedId: Number(window.currentChatOtherUserId),
        reason: reason,
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Report failed');
    }

    closeReportModal();
    const reportedName = window.currentChatName || 'User';
    clearActiveChatState();
    alert(`${reportedName} has been reported and blocked. They have been removed from your hive.`);
    await loadChats();
  } catch (e) {
    console.error('Report failed:', e);
    alert('Failed to submit report. Please try again.');
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Report & Block';
    }
  }
};

// --- Block ---
window.blockCurrentChatUser = async function () {
  closeChatMenu();
  if (!currentUserId || !window.currentChatOtherUserId) return;

  const name = window.currentChatName || 'this user';
  if (!confirm(`Block ${name}? They won't be able to see or contact you.`)) return;

  try {
    const res = await fetch(`${API_BASE}/moderation/block`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        blockerId: Number(currentUserId),
        blockedId: Number(window.currentChatOtherUserId),
      }),
    });

    if (!res.ok) throw new Error('Block failed');

    clearActiveChatState();
    alert(`${name} has been blocked and removed from your hive.`);
    await loadChats();
  } catch (e) {
    console.error('Block failed:', e);
    alert('Failed to block user. Please try again.');
  }
};

// --- Unbuzz (Unmatch) ---
window.unbuzzCurrentMatch = async function () {
  closeChatMenu();
  if (!currentUserId || !window.currentChatOtherUserId) return;

  const name = window.currentChatName || 'this user';
  if (!confirm(`Unbuzz ${name}? This will dissolve your match and you won't be able to chat anymore.`)) return;

  try {
    const res = await fetch(`${API_BASE}/moderation/unmatch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: Number(currentUserId),
        otherUserId: Number(window.currentChatOtherUserId),
      }),
    });

    if (!res.ok) throw new Error('Unmatch failed');

    clearActiveChatState();
    alert(`You've unbuzzed ${name}. The match has been dissolved.`);
    await loadChats();
  } catch (e) {
    console.error('Unmatch failed:', e);
    alert('Failed to unmatch. Please try again.');
  }
};

// Clear the active chat pane after a moderation action
function clearActiveChatState() {
  window.currentConversationId = null;
  window.currentChatOtherUserId = null;
  window.currentChatName = null;
  window.currentChatImg = null;
  const nameEl = document.getElementById('active-chat-name');
  const imgEl = document.getElementById('active-chat-img');
  const msgEl = document.getElementById('messages-container');
  if (nameEl) nameEl.innerText = 'Select a Chat';
  if (imgEl) imgEl.src = '/assets/BeeProfileIcon.png';
  if (msgEl) msgEl.innerHTML = '<p class="text-center text-secondary italic">Select a conversation to start messaging!</p>';
}

// =============================================
// CALENDAR MODULE
// =============================================

let calendarCurrentMonth = new Date().getMonth();
let calendarCurrentYear = new Date().getFullYear();
let calendarSelectedDay = null;
let calendarDatesCache = [];

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_NAMES_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return `${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatTimeDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  let hours = d.getHours();
  const mins = d.getMinutes().toString().padStart(2, '0');
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  return `${hours}:${mins} ${ampm}`;
}

function updateCalendarTitle() {
  const titleEl = document.getElementById('calendar-month-title');
  if (titleEl) {
    titleEl.textContent = `${MONTH_NAMES[calendarCurrentMonth]} ${calendarCurrentYear}`;
  }
}

window.navigateCalendarMonth = function (delta) {
  calendarCurrentMonth += delta;
  if (calendarCurrentMonth > 11) {
    calendarCurrentMonth = 0;
    calendarCurrentYear++;
  } else if (calendarCurrentMonth < 0) {
    calendarCurrentMonth = 11;
    calendarCurrentYear--;
  }
  calendarSelectedDay = null;
  updateCalendarTitle();
  renderCalendarGrid(calendarCurrentYear, calendarCurrentMonth, calendarDatesCache);
};

window.selectCalendarDay = function (day) {
  calendarSelectedDay = calendarSelectedDay === day ? null : day;
  renderCalendarGrid(calendarCurrentYear, calendarCurrentMonth, calendarDatesCache);
};

function getDateEventsForDay(year, month, day, dates) {
  return dates.filter(d => {
    if (!d.scheduledStart) return false;
    const s = new Date(d.scheduledStart);
    return s.getFullYear() === year && s.getMonth() === month && s.getDate() === day;
  });
}

function renderCalendarGrid(year, month, dates) {
  const grid = document.getElementById('calendar-grid');
  if (!grid) return;

  const today = new Date();
  const todayDay = today.getDate();
  const todayMonth = today.getMonth();
  const todayYear = today.getFullYear();

  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const daysInMonth = lastDay.getDate();

  // Monday=0 start: JS getDay() gives 0=Sun, so convert
  let startDow = firstDay.getDay() - 1;
  if (startDow < 0) startDow = 6; // Sunday becomes 6

  const totalCells = Math.ceil((startDow + daysInMonth) / 7) * 7;
  let html = '';

  // Previous month days count
  const prevMonthLast = new Date(year, month, 0).getDate();

  for (let i = 0; i < totalCells; i++) {
    const col = i % 7;
    const row = Math.floor(i / 7);
    const totalRows = Math.ceil(totalCells / 7);
    const isLastRow = row === totalRows - 1;
    const isLastCol = col === 6;

    let dayNum = null;
    let isCurrentMonth = false;
    let displayNum = '';

    if (i < startDow) {
      // Previous month overflow
      displayNum = prevMonthLast - startDow + 1 + i;
      isCurrentMonth = false;
    } else if (i >= startDow + daysInMonth) {
      // Next month overflow
      displayNum = i - startDow - daysInMonth + 1;
      isCurrentMonth = false;
    } else {
      dayNum = i - startDow + 1;
      displayNum = dayNum;
      isCurrentMonth = true;
    }

    const isToday = isCurrentMonth && dayNum === todayDay && month === todayMonth && year === todayYear;
    const isSelected = isCurrentMonth && dayNum === calendarSelectedDay;

    // Find events for this day
    let eventsForDay = [];
    if (isCurrentMonth && dayNum) {
      eventsForDay = getDateEventsForDay(year, month, dayNum, dates);
    }

    // Build cell classes
    let cellClasses = 'p-2 relative transition-colors duration-150';
    if (!isLastCol) cellClasses += ' border-r';
    if (!isLastRow) cellClasses += ' border-b';
    cellClasses += ' border-surface-container';

    if (!isCurrentMonth) {
      cellClasses += ' opacity-30';
    } else if (isSelected) {
      cellClasses += ' bg-surface-container-low';
    } else if (eventsForDay.some(e => e.status === 'accepted_by_both')) {
      cellClasses += ' bg-primary-container/10';
    } else if (eventsForDay.some(e => e.status !== 'accepted_by_both' && e.status !== 'declined')) {
      cellClasses += ' bg-tertiary-container/5';
    }

    const clickHandler = isCurrentMonth ? `onclick="selectCalendarDay(${dayNum})"` : '';
    const cursorClass = isCurrentMonth ? 'cursor-pointer hover:bg-surface-container-low' : '';

    // Day number styling
    let dayNumHtml = '';
    if (isToday) {
      dayNumHtml = `<div class="flex items-start justify-between">
        <span class="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-on-primary text-xs font-black">${displayNum}</span>
        ${isSelected ? '<span class="w-1.5 h-1.5 rounded-full bg-primary mt-1"></span>' : ''}
      </div>`;
    } else if (isSelected) {
      dayNumHtml = `<div class="flex items-start justify-between">
        <span class="font-black text-primary text-sm">${displayNum}</span>
        <span class="w-1.5 h-1.5 rounded-full bg-primary mt-1"></span>
      </div>
      <div class="mt-1 h-[3px] w-full bg-primary rounded-full"></div>`;
    } else {
      dayNumHtml = `<span class="text-sm font-medium">${displayNum}</span>`;
    }

    // Event labels
    let eventLabelsHtml = '';
    if (isCurrentMonth && eventsForDay.length > 0) {
      eventsForDay.forEach(ev => {
        const other = ev.match.user1.userId == currentUserId ? ev.match.user2 : ev.match.user1;
        const locName = ev.location?.name || ev.location?.category || 'Date';
        const truncLabel = locName.length > 12 ? locName.slice(0, 11) + '…' : locName;

        if (ev.status === 'accepted_by_both') {
          eventLabelsHtml += `<div class="mt-1 bg-primary-container text-on-primary-container text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate" title="${locName} w/ ${other.name}">${truncLabel}</div>`;
        } else if (ev.status !== 'declined') {
          eventLabelsHtml += `<div class="mt-1 bg-tertiary-container/30 text-on-tertiary-container text-[10px] font-bold px-1.5 py-0.5 rounded-md truncate border border-tertiary/20" title="Proposed: ${locName}">Proposed: …</div>`;
        }
      });
    }

    html += `<div class="${cellClasses} ${cursorClass}" ${clickHandler}>
      ${dayNumHtml}
      ${eventLabelsHtml}
    </div>`;
  }

  grid.innerHTML = html;
}

function renderConfirmedDates(confirmedDates) {
  const container = document.getElementById('calendar-confirmed-list');
  if (!container) return;

  if (confirmedDates.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8">
        <span class="material-symbols-outlined text-4xl text-outline-variant mb-3 block">event_busy</span>
        <p class="text-sm text-secondary italic">No confirmed dates yet.</p>
        <p class="text-xs text-outline mt-1">Accept a date proposal to see it here!</p>
      </div>`;
    return;
  }

  container.innerHTML = confirmedDates.map(d => {
    const m = d.match;
    const other = m.user1.userId == currentUserId ? m.user2 : m.user1;
    const loc = d.location;
    const dateStr = formatDateDisplay(d.scheduledStart);
    const timeStr = formatTimeDisplay(d.scheduledStart);
    const locName = loc?.name || loc?.category || 'Somewhere fun';

    return `
    <div class="bg-surface-container-lowest hover:bg-surface-container-low p-4 rounded-xl transition-all group relative overflow-hidden shadow-sm border border-outline-variant/20">
        <div class="flex gap-4">
            <div class="w-14 h-14 rounded-full overflow-hidden flex-shrink-0 border-2 border-primary-container shadow-sm">
                <img class="w-full h-full object-cover" src="${other.profilePicUrl || '/assets/BeeProfileIcon.png'}" alt="${other.name}">
            </div>
            <div class="flex-grow min-w-0">
                <h4 class="font-bold text-on-surface text-[15px] leading-tight">${locName}</h4>
                <p class="text-xs text-secondary font-medium mt-0.5">with ${other.name}</p>
                <div class="mt-2 flex items-center gap-3 text-[11px] font-bold text-primary">
                    ${dateStr ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">calendar_today</span> ${dateStr.toUpperCase()}</span>` : ''}
                    ${timeStr ? `<span class="flex items-center gap-1"><span class="material-symbols-outlined text-[14px]">schedule</span> ${timeStr}</span>` : ''}
                </div>
                ${loc?.address ? `<p class="text-[10px] text-outline mt-1.5 truncate">${loc.address}</p>` : ''}
            </div>
            <button class="w-8 h-8 flex items-center justify-center rounded-full text-secondary hover:bg-surface-container-high transition-colors opacity-0 group-hover:opacity-100 flex-shrink-0">
                <span class="material-symbols-outlined text-[18px]">more_vert</span>
            </button>
        </div>
    </div>`;
  }).join('');
}

function renderAwaitingDates(pendingDates) {
  const container = document.getElementById('calendar-awaiting-list');
  if (!container) return;

  if (pendingDates.length === 0) {
    container.innerHTML = `
      <div class="text-center py-8">
        <span class="material-symbols-outlined text-4xl text-outline-variant mb-3 block">inbox</span>
        <p class="text-sm text-secondary italic">No pending proposals.</p>
        <p class="text-xs text-outline mt-1">Date suggestions will appear here.</p>
      </div>`;
    return;
  }

  container.innerHTML = pendingDates.map(d => {
    const m = d.match;
    const isUser1 = m.user1Id == currentUserId;
    const other = isUser1 ? m.user2 : m.user1;
    const loc = d.location;
    const locName = loc?.name || loc?.category || 'Somewhere fun';
    const dateStr = d.scheduledStart ? `for ${formatDateDisplay(d.scheduledStart)}` : '';
    const timeStr = d.scheduledStart ? formatTimeDisplay(d.scheduledStart) : '';

    const acceptedByMe = (isUser1 && d.status === 'accepted_by_user_1') || (!isUser1 && d.status === 'accepted_by_user_2');

    let actionsHtml = '';
    if (acceptedByMe) {
      actionsHtml = `<div class="text-center w-full py-2.5 text-secondary font-bold text-xs italic">Waiting for match to accept</div>`;
    } else {
      actionsHtml = `<button id="accept-btn-${d.suggestionId}" class="flex-grow py-2.5 rounded-full bg-primary-container text-on-primary-container font-bold text-xs hover:scale-[1.02] active:scale-95 transition-transform shadow-sm" onclick="respondToDate(${d.suggestionId}, 'accept')">Accept</button>
                <button id="decline-btn-${d.suggestionId}" class="flex-grow py-2.5 rounded-full bg-surface-container-high text-secondary font-bold text-xs hover:scale-[1.02] active:scale-95 transition-transform" onclick="respondToDate(${d.suggestionId}, 'reject')">Decline</button>`;
    }

    return `
    <div class="bg-surface-container-highest/40 p-1 rounded-2xl">
        <div class="bg-surface-container-lowest p-5 rounded-xl border border-primary/5 shadow-sm">
            <div class="flex items-center gap-3 mb-3">
                <span class="material-symbols-outlined text-tertiary text-[20px]">hourglass_top</span>
                <span class="text-sm font-bold text-on-surface-variant">Pending Proposal</span>
            </div>
            <p class="text-sm text-secondary leading-relaxed mb-1">
                <span class="font-bold text-primary">${other.name}</span> suggested
                <span class="italic text-primary-dim">${locName}</span>
                ${dateStr ? `${dateStr}${timeStr ? ` at ${timeStr}` : ''}.` : '.'}
            </p>
            <div class="flex gap-2 mt-4">
                ${actionsHtml}
            </div>
        </div>
    </div>`;
  }).join('');
}

async function checkGoogleCalendarSync() {
  if (!currentUserId) return;
  try {
    const res = await fetch(`${API_BASE}/users/${currentUserId}`);
    if (!res.ok) return;
    const user = await res.json();
    const badge = document.getElementById('gcal-sync-badge');
    if (badge && user.googleRefreshToken) {
      badge.classList.remove('hidden');
      badge.classList.add('flex');
    }
  } catch (e) {
    // Silently ignore
  }
}

async function loadDates() {
  if (!currentUserId) return;
  const confirmedList = document.getElementById('calendar-confirmed-list');
  const awaitingList = document.getElementById('calendar-awaiting-list');

  // Show loading spinners
  const loadingHtml = `<div class="flex items-center justify-center py-8">
    <span class="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
  </div>`;
  if (confirmedList) confirmedList.innerHTML = loadingHtml;
  if (awaitingList) awaitingList.innerHTML = loadingHtml;

  // Update calendar title
  updateCalendarTitle();

  // Check Google Calendar sync
  checkGoogleCalendarSync();

  try {
    const res = await fetch(`${API_BASE}/dates/user/${currentUserId}`);
    if (!res.ok) throw new Error('Backend unavailable');
    const dates = await res.json();

    // Filter out declined dates
    const activeDates = dates.filter(d => d.status !== 'declined');
    calendarDatesCache = activeDates;

    const confirmedDates = activeDates.filter(d => d.status === 'accepted_by_both');
    const pendingDates = activeDates.filter(d => d.status !== 'accepted_by_both');

    // Render all sections
    renderCalendarGrid(calendarCurrentYear, calendarCurrentMonth, activeDates);
    renderConfirmedDates(confirmedDates);
    renderAwaitingDates(pendingDates);

  } catch (e) {
    console.error('Failed to load dates', e);
    // Error state
    const errorHtml = `
      <div class="text-center py-8">
        <span class="material-symbols-outlined text-error text-4xl mb-3 block">cloud_off</span>
        <p class="text-sm text-error font-medium">Could not load dates</p>
        <p class="text-xs text-secondary mt-1">Please check your connection and try again.</p>
        <button onclick="loadDates()" class="mt-3 px-4 py-2 rounded-full bg-primary-container text-on-primary-container text-xs font-bold hover:scale-[1.02] transition-transform">Retry</button>
      </div>`;
    if (confirmedList) confirmedList.innerHTML = errorHtml;
    if (awaitingList) awaitingList.innerHTML = '';
    // Still render an empty grid
    renderCalendarGrid(calendarCurrentYear, calendarCurrentMonth, []);
  }
}

async function respondToDate(suggestionId, action) {
  if (!currentUserId) return;

  // Show loading state on the button
  const acceptBtn = document.getElementById(`accept-btn-${suggestionId}`);
  const declineBtn = document.getElementById(`decline-btn-${suggestionId}`);
  if (action === 'accept' && acceptBtn) {
    acceptBtn.disabled = true;
    acceptBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>';
  }
  if (action === 'reject' && declineBtn) {
    declineBtn.disabled = true;
    declineBtn.innerHTML = '<span class="material-symbols-outlined animate-spin text-[14px]">progress_activity</span>';
  }

  try {
    const res = await fetch(`${API_BASE}/dates/${suggestionId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: Number(currentUserId) })
    });

    if (!res.ok) throw new Error(`Failed to ${action} date`);

    const result = await res.json();

    // If the date was accepted by both, show a special notification
    if (result.status === 'accepted_by_both') {
      alert('🎉 Date confirmed! A Google Calendar event has been created for both of you.');
    } else if (action === 'accept') {
      alert('Date accepted! Waiting for your match to confirm.');
    } else {
      alert('Date declined.');
    }

    // Refetch and re-render everything
    await loadDates();
  } catch (e) {
    console.error(e);
    alert(`Failed to ${action} the date. Please try again.`);
    // Restore buttons
    if (acceptBtn) { acceptBtn.disabled = false; acceptBtn.textContent = 'Accept'; }
    if (declineBtn) { declineBtn.disabled = false; declineBtn.textContent = 'Decline'; }
  }
}

async function refreshSuggestions() {
  if (!currentUserId) return;
  const awaitingList = document.getElementById('calendar-awaiting-list');
  if (awaitingList) {
    awaitingList.innerHTML = `<div class="flex items-center justify-center py-8">
                                <span class="material-symbols-outlined text-primary animate-spin text-3xl">progress_activity</span>
                              </div>`;
  }
  
  try {
    const res = await fetch(`${API_BASE}/dates/user/${currentUserId}/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });
    if (!res.ok) throw new Error('Refresh failed');
    await loadDates();
  } catch (e) {
    console.error('Failed to refresh suggestions:', e);
    alert('Failed to refresh suggestions. Please try again.');
    await loadDates();
  }
}

// Regeneration Timer Logic
function updateRegenerationTimer(expiresAtIso = null) {
  const now = new Date();
  let target = new Date();

  if (expiresAtIso) {
    target = new Date(expiresAtIso);
  } else {
    target.setDate(now.getDate() + (7 - now.getDay()));
    target.setHours(0, 0, 0, 0);

    // If it's already Sunday exactly midnight, or past midnight on Sunday
    if (now.getDay() === 0 && now.getTime() > target.getTime() - 7 * 24 * 60 * 60 * 1000) {
      if (now > target) {
        target.setDate(target.getDate() + 7);
      }
    }
  }

  const diffMs = target - now;
  if (diffMs < 0) return;

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHrs = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));

  const daysEl = document.getElementById('regen-days');
  const hrsEl = document.getElementById('regen-hrs');

  if (daysEl) daysEl.innerText = diffDays.toString().padStart(2, '0');
  if (hrsEl) hrsEl.innerText = diffHrs.toString().padStart(2, '0');

  // Update banner text
  const bannerTexts = document.querySelectorAll('.bg-primary-container p.text-lg');
  bannerTexts.forEach(p => {
    if (p.innerText.includes('Hive Regeneration')) {
      p.innerText = `${diffDays} Days until Hive Regeneration`;
    }
  });
}
setInterval(() => updateRegenerationTimer(), 1000 * 60 * 60);
document.addEventListener('DOMContentLoaded', () => updateRegenerationTimer());