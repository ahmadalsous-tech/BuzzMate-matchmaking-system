let currentUserId = localStorage.getItem('currentUserId') || null;

const API_BASE = 'http://localhost:3000';

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
  });
}

function logoutUser() {
  currentUserId = null;
  localStorage.removeItem('currentUserId');
  document.getElementById('main-app').classList.add('hidden');
  document.getElementById('page-landing').classList.remove('hidden');
  document.getElementById('page-landing').classList.add('active');
}

// Page navigation logic
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', (e) => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    e.currentTarget.classList.add('active');
    const pageId = e.currentTarget.getAttribute('data-page');
    document.querySelectorAll('main .page').forEach(p => p.classList.remove('active'));

    const targetPage = document.getElementById('page-' + pageId);
    if (targetPage) targetPage.classList.add('active');

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
  });
}

// Auth UI Logic
let currentAuthMode = 'signup';

function openAuthOverlay(mode) {
  document.getElementById('page-signup').classList.remove('hidden');
  document.getElementById('page-signup').classList.add('active');
  switchAuthTab(mode);
}

function closeAuthOverlay() {
  document.getElementById('page-signup').classList.remove('active');
  document.getElementById('page-signup').classList.add('hidden');
}

function switchAuthTab(mode) {
  currentAuthMode = mode;
  const tabSignup = document.getElementById('tab-signup');
  const tabLogin = document.getElementById('tab-login');
  const signupFields = document.getElementById('signup-fields');
  const submitBtn = document.getElementById('auth-submit-btn');

  if (mode === 'signup') {
    tabSignup.classList.add('active-tab');
    tabSignup.classList.remove('inactive-tab');
    tabLogin.classList.remove('active-tab');
    tabLogin.classList.add('inactive-tab');
    signupFields.style.display = 'block';
    
    // Make text fields required again
    document.getElementById('auth-name').setAttribute('required', 'true');
    submitBtn.innerText = 'Start Matching';
  } else {
    tabLogin.classList.add('active-tab');
    tabLogin.classList.remove('inactive-tab');
    tabSignup.classList.remove('active-tab');
    tabSignup.classList.add('inactive-tab');
    signupFields.style.display = 'none';
    
    // Remove required attr so we can submit just email
    document.getElementById('auth-name').removeAttribute('required');
    submitBtn.innerText = 'Log In';
  }
}

async function submitAuth() {
  if (currentAuthMode === 'signup') {
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
    if (sidebarImg && user.profilePicUrl) {
      sidebarImg.src = user.profilePicUrl;
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
    return true;
  } catch (err) {
    console.error('Failed to load current user', err);
    return false;
  }
}

async function loginUser() {
  const email = document.getElementById('auth-email').value;
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
  const email = document.getElementById('auth-email').value;
  const name = document.getElementById('auth-name').value;
  const age = Number(document.getElementById('auth-age').value) || 18;
  const gender = document.getElementById('auth-gender').value;
  try {
    const res = await fetch(`${API_BASE}/users/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, age, gender, datingPreference: 'unsure' })
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
    if(document.getElementById('sidebar-name')) document.getElementById('sidebar-name').innerText = `${user.name || name}, ${user.age || age}`;

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

  if (!currentUserId) {
    if (!email || !name || !age) return alert("Email, name, and age required");
    try {
      const res = await fetch(`${API_BASE}/users/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, age, gender: document.getElementById('auth-gender')?.value || 'other', datingPreference, occupation })
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
        body: JSON.stringify({ name, email, age, occupation, datingPreference })
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

async function connectGoogleCalendar() {
  if (!currentUserId) return alert("Please save your profile first!");

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
    if (preferredGenderSelect && pref.preferredGender) preferredGenderSelect.value = pref.preferredGender;
    if (dateMoodSelect && pref.dateMood) dateMoodSelect.value = pref.dateMood;
    if (maxPriceTierInput && pref.maxPriceTier != null) maxPriceTierInput.value = pref.maxPriceTier;

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

async function loadDiscover() {
  if (!currentUserId) return;
  try {
    let res = await fetch(`${API_BASE}/discover/${currentUserId}`);
    let candidates = await res.json();
    const discoverCard = document.getElementById('discover-card');

    if (!candidates || candidates.length === 0) {
      // Auto-regenerate and try again once
      await fetch(`${API_BASE}/discover/${currentUserId}/regenerate`, { method: 'POST' });
      res = await fetch(`${API_BASE}/discover/${currentUserId}`);
      candidates = await res.json();
      
      if (!candidates || candidates.length === 0) {
        discoverCard.innerHTML = `<div class="match-card"><div class="match-details"><p style="text-align:center;">No fresh matches in your hive. Try expanding your preferences.</p></div></div>`;
        return;
      }
    }

    // Display the first candidate
    const c = candidates[0];
    const openerText = c.preferences && c.preferences.opener ? c.preferences.opener : "Looking for my match!";
    discoverCard.innerHTML = `
      <div class="match-card" data-userId="${c.userId}">
        <img src="${c.profilePicUrl || 'https://i.pravatar.cc/150'}" class="match-thumb">
        <div class="match-details">
          <h3>${c.name}, ${c.age}</h3>
          <p>${c.occupation || 'Bee'} • Match Candidate</p>
          <p style="margin-top: 8px; font-style: italic; color: var(--text-dark);">"${openerText}"</p>
        </div>
        <div class="match-actions">
          <button class="btn btn-unlike" onclick="swipe(${c.userId}, 'dislike')"><i class="fa fa-times"></i></button>
          <button class="btn btn-buzz" onclick="swipe(${c.userId}, 'like')"><i class="fa-solid fa-brands fa-forumbee"></i> Buzz</button>
        </div>
      </div>
    `;
  } catch (e) {
    console.error(e);
  }
}

async function swipe(targetId, type) {
  if (!currentUserId) return;
  try {
    await fetch(`${API_BASE}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: Number(currentUserId), receiverId: targetId, actionType: type })
    });
    alert(`You swiped ${type}!`);
    loadDiscover(); // load next
  } catch (e) {
    console.error(e);
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
      chatList.innerHTML = `<div class="match-card" style="justify-content: center; color: var(--muted-brown);">No conversations yet. Buzz some profiles!</div>`;
      return;
    }

    chatList.innerHTML = conversations.map(c => {
      const m = c.match;
      const other = m.user1.userId == currentUserId ? m.user2 : m.user1;
      const preview = c.lastMessagePreview || 'No messages yet';
      return `
        <div class="match-card">
          <img src="${other.profilePicUrl || 'https://i.pravatar.cc/150?u=' + other.userId}" class="match-thumb">
          <div class="match-details">
            <h3>${other.name}, ${other.age}</h3>
            <p style="color: var(--muted-brown); font-style: italic;">${preview}</p>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load chats', e);
  }
}

async function loadDates() {
  if (!currentUserId) return;
  const dateList = document.querySelector('#page-calendar .card-list');
  try {
    const res = await fetch(`${API_BASE}/dates/user/${currentUserId}`);
    if (!res.ok) return;
    const dates = await res.json();

    if (!dates || dates.length === 0) {
      dateList.innerHTML = `<div class="match-card" style="justify-content: center; color: var(--muted-brown);">No upcoming dates scheduled.</div>`;
      return;
    }

    dateList.innerHTML = dates.map(d => {
      const m = d.match;
      const other = m.user1.userId == currentUserId ? m.user2 : m.user1;
      const loc = d.location;
      const statusLabel = d.status.replace(/_/g, ' ');
      return `
        <div class="match-card">
          <div class="match-details">
            <h3>${other.name} — ${loc.name}</h3>
            <p>${loc.address || loc.category || 'Somewhere fun'}</p>
            <p style="margin-top: 5px; text-transform: capitalize; color: var(--muted-brown);">${statusLabel}</p>
          </div>
          <div class="match-actions">
            ${d.status !== 'accepted_by_both' ? `
              <button class="btn btn-buzz" onclick="respondToDate(${d.suggestionId}, 'accept')">Accept</button>
              <button class="btn btn-unlike" onclick="respondToDate(${d.suggestionId}, 'reject')"><i class="fa fa-times"></i></button>
            ` : '<span style="color: var(--honey);">✓ Confirmed</span>'}
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Failed to load dates', e);
  }
}

async function respondToDate(suggestionId, action) {
  if (!currentUserId) return;
  try {
    await fetch(`${API_BASE}/dates/${suggestionId}/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: Number(currentUserId) })
    });
    alert(`Date ${action}ed!`);
    loadDates();
  } catch (e) {
    console.error(e);
  }
}
