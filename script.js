/* ==========================================================================
   KisanSetu — Application Logic & Shared Reactive State Store
   ========================================================================== */

// Supabase Backend Client Integration
const SUPABASE_URL = 'https://tjopffkptrfoondicyop.supabase.co';
const SUPABASE_KEY = 'sb_publishable_WiTGzE1ipN12vd38YeUZUw_ib6_F8dy';
let supabaseClient = null;

function initSupabase() {
  if (typeof window.supabase !== 'undefined' && window.supabase.createClient) {
    try {
      supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('✅ KisanSetu Supabase Client connected to:', SUPABASE_URL);
      subscribeToLiveQueueRealtime();
      subscribeToBookingsRealtime();
      fetchSupabaseData();
      fetchAndRenderProcurementCentres();
      checkActiveSessionOnLoad();
    } catch (err) {
      console.warn('Supabase initialization notice:', err);
    }
  }
}

// Check for active Supabase Auth session on load
async function checkActiveSessionOnLoad() {
  if (!supabaseClient) return;
  try {
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) {
      const meta = session.user.user_metadata || {};
      const role = meta.role || 'farmer';
      const name = meta.full_name || session.user.email.split('@')[0];
      const centreName = meta.centre_name || 'XYZ Procurement Centre';
      setupUserSessionFromSupabase(session.user, role, name, centreName);
    }
  } catch (e) {
    console.warn('Session check notice:', e);
  }
}

// Register a newly created Procurement Centre into Supabase Database
async function registerProcurementCentreInSupabase(centreName, officerName) {
  if (!supabaseClient || !centreName) return;
  try {
    const centreCode = 'PC-' + Math.random().toString(36).substring(2, 8).toUpperCase();
    
    // Insert/upsert into procurement_centres table
    await supabaseClient.from('procurement_centres').upsert([{
      centre_code: centreCode,
      name: centreName,
      district: 'Karnal',
      state_name: 'Haryana',
      address: `${centreName}, Main Mandi Complex`,
      capacity_quintals_per_day: 2500,
      active_counters: 3,
      avg_processing_time_min: 4.8,
      queue_status: 'Low'
    }], { onConflict: 'name' });

    // Insert/upsert into live_queue table
    await supabaseClient.from('live_queue').upsert([{
      centre_code: centreCode,
      centre_name: centreName,
      serving_token_num: 102,
      serving_token_code: 'A102'
    }], { onConflict: 'centre_code' });

    // Refresh dynamic centre cards for farmers
    fetchAndRenderProcurementCentres();
  } catch (err) {
    console.warn('Centre registration sync notice:', err);
  }
}

// Fetch all registered Procurement Centres from Supabase and render for Farmers
async function fetchAndRenderProcurementCentres() {
  if (!supabaseClient) return;
  try {
    const { data: centres } = await supabaseClient
      .from('procurement_centres')
      .select('*')
      .order('created_at', { ascending: false });

    if (centres && centres.length > 0) {
      renderCentreSelectionCards(centres);
    }
  } catch (e) {
    console.warn('Procurement centres fetch notice:', e);
  }
}

// Dynamically render Procurement Centre cards in Step 2 of Slot Booking
function renderCentreSelectionCards(centres) {
  const container = document.getElementById('centreSelectionList');
  if (!container) return;

  let html = '';
  centres.forEach((c, idx) => {
    const isSelected = state.bookingWizard.selectedCentre === c.name || (idx === 0 && !state.bookingWizard.selectedCentre);
    const badgeText = idx === 0 ? 'Recommended • Available' : 'Active Centre';
    const badgeClass = idx === 0 ? 'badge-success' : 'badge-info';
    const distText = (3.5 + (idx * 2.2)).toFixed(1) + ' km';

    if (isSelected && idx === 0 && !state.bookingWizard.selectedCentre) {
      state.bookingWizard.selectedCentre = c.name;
    }

    html += `
      <div class="centre-card ${isSelected ? 'selected' : ''}" onclick="selectCentre('${c.name}', ${idx})">
        <div class="centre-card-header">
          <div>
            <h4>${c.name}</h4>
            <span class="badge ${badgeClass}">${badgeText}</span>
          </div>
          <span class="dist-pill">${distText}</span>
        </div>
        <div class="centre-stats-row">
          <div>District: <strong>${c.district || 'Karnal'}</strong></div>
          <div>Est. Wait: <strong>${c.avg_processing_time_min || 4.8} min/token</strong></div>
          <div>Counters: <strong>${c.active_counters || 3} Active</strong></div>
          <div>Status: <span class="text-success font-bold">Open</span></div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Update smart recommendation banner title
  const recCentreName = document.getElementById('recCentreName');
  if (recCentreName && centres[0]) {
    recCentreName.textContent = centres[0].name;
  }
}

// Supabase Realtime Listener for Live Queue (Farmer Screen Sync)
function subscribeToLiveQueueRealtime() {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .channel('public:live_queue')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'live_queue' }, (payload) => {
        console.log('⚡ Realtime Live Queue Payload Received:', payload);
        if (payload.new && payload.new.serving_token_num) {
          state.queue.servingTokenNum = payload.new.serving_token_num;
          updateQueueDisplays();
          showToast(`🔔 Realtime Update: Token A${payload.new.serving_token_num} is now being served!`);
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('Realtime subscription notice:', e);
  }
}

// Supabase Realtime Listener for New Farmer Bookings (Centre Officer Staff Portal Sync)
function subscribeToBookingsRealtime() {
  if (!supabaseClient) return;
  try {
    supabaseClient
      .channel('public:bookings')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, (payload) => {
        console.log('🌾 Realtime New Booking Payload Received:', payload);
        if (payload.new) {
          addBookingToStaffTable(payload.new);
          showToast(`🌾 New Farmer Booking Received: Token ${payload.new.token_code} (${payload.new.crop_name})!`);
        }
      })
      .subscribe();
  } catch (e) {
    console.warn('Bookings realtime subscription notice:', e);
  }
}

// Append Realtime Farmer Booking to Centre Staff Portal Table
function addBookingToStaffTable(b) {
  const tbody = document.getElementById('staffBookingsTableBody');
  if (!tbody) return;

  const tr = document.createElement('tr');
  tr.style.background = '#f0fdf4';
  tr.style.transition = 'all 0.4s ease';
  tr.innerHTML = `
    <td><span class="badge badge-primary font-mono">${b.token_code || 'A108'}</span></td>
    <td>${state.currentUser?.name || 'Farmer'}</td>
    <td>${b.crop_name}</td>
    <td>${b.quantity_quintals || b.raw_quantity} Quintals</td>
    <td>${b.booking_date}</td>
    <td>${b.time_slot}</td>
    <td><span class="badge badge-success">Booked ✓</span></td>
  `;

  tbody.insertBefore(tr, tbody.firstChild);

  // Update next token label in staff portal
  const staffNextTok = document.getElementById('staffUserTok');
  if (staffNextTok) {
    staffNextTok.textContent = `${b.token_code} (${state.currentUser?.name || 'Farmer'})`;
  }
}

// Fetch initial data from Supabase
async function fetchSupabaseData() {
  if (!supabaseClient) return;
  try {
    const { data: queueData } = await supabaseClient.from('live_queue').select('*').limit(1);
    if (queueData && queueData.length > 0) {
      state.queue.servingTokenNum = queueData[0].serving_token_num || 102;
      updateQueueDisplays();
    }
  } catch (err) {
    console.warn('Supabase fetch notice:', err);
  }
}

// Sync Booking to Supabase DB (Transmits Farmer Booking immediately to Centre)
async function syncBookingToSupabase(bookingData) {
  if (!supabaseClient) return;
  try {
    await supabaseClient.from('bookings').insert([{
      centre_name: bookingData.centre,
      crop_name: bookingData.crop,
      raw_quantity: bookingData.rawQuantity,
      unit: bookingData.unit,
      quantity_quintals: bookingData.quantity,
      booking_date: bookingData.date,
      time_slot: bookingData.timeSlot,
      token_code: bookingData.token,
      token_seq: parseInt(bookingData.token.replace('A', '')) || 107,
      status: 'Booked'
    }]);
  } catch (e) {
    console.warn('Booking sync notice:', e);
  }
}

// Sync Queue Update to Supabase DB (Triggered by Procurement Centre Officer)
async function syncQueueToSupabase(servingNum, centreName = 'XYZ Procurement Centre') {
  if (!supabaseClient) return;
  try {
    const { error } = await supabaseClient.from('live_queue').upsert([{
      centre_code: 'PC-XYZ-01',
      centre_name: centreName,
      serving_token_num: servingNum,
      serving_token_code: `A${servingNum}`,
      updated_at: new Date().toISOString()
    }], { onConflict: 'centre_code' });

    if (error) console.warn('Queue sync error:', error);
  } catch (e) {
    console.warn('Queue sync notice:', e);
  }
}

// Switch Auth Mode (Sign In vs Register)
function switchAuthMode(mode) {
  const signInBtn = document.getElementById('authModeSignInBtn');
  const signUpBtn = document.getElementById('authModeSignUpBtn');
  const signInForms = document.querySelectorAll('.auth-form-signin');
  const signUpForms = document.querySelectorAll('.auth-form-signup');

  if (mode === 'signin') {
    if (signInBtn) signInBtn.classList.add('active');
    if (signUpBtn) signUpBtn.classList.remove('active');
    signInForms.forEach(f => f.style.display = 'block');
    signUpForms.forEach(f => f.style.display = 'none');
  } else {
    if (signUpBtn) signUpBtn.classList.add('active');
    if (signInBtn) signInBtn.classList.remove('active');
    signInForms.forEach(f => f.style.display = 'none');
    signUpForms.forEach(f => f.style.display = 'block');
  }
}

// Handle Supabase Authentication Submissions
async function handleSupabaseAuthSubmit(event, mode, role) {
  event.preventDefault();
  const form = event.target;
  const email = form.querySelector('[name="email"]')?.value || '';
  const password = form.querySelector('[name="password"]')?.value || '';
  const fullName = form.querySelector('[name="full_name"]')?.value || email.split('@')[0];
  const centreName = form.querySelector('[name="centre_name"]')?.value || 'XYZ Procurement Centre';

  if (!supabaseClient) {
    showToast('Demo Mode: Authenticated locally');
    setupUserSessionFromSupabase({ email }, role, fullName, centreName);
    return;
  }

  if (mode === 'signup') {
    showToast('Registering account with Supabase...');
    try {
      const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            full_name: fullName,
            role: role,
            centre_name: centreName
          }
        }
      });

      // If Procurement Centre role, register centre into database
      if (role === 'procurement_centre' && centreName) {
        registerProcurementCentreInSupabase(centreName, fullName);
      }

      if (error) {
        showToast(`Registration Notice: ${error.message}`);
        setupUserSessionFromSupabase({ email }, role, fullName, centreName);
        return;
      }

      showToast('Account registered successfully! Logged in.');
      setupUserSessionFromSupabase(data.user || { email }, role, fullName, centreName);
    } catch (err) {
      console.error(err);
      if (role === 'procurement_centre' && centreName) {
        registerProcurementCentreInSupabase(centreName, fullName);
      }
      setupUserSessionFromSupabase({ email }, role, fullName, centreName);
    }
  } else {
    showToast('Authenticating with Supabase...');
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email: email,
        password: password
      });

      if (error) {
        showToast(`Sign in notice: ${error.message}`);
        setupUserSessionFromSupabase({ email }, role, fullName, centreName);
        return;
      }

      if (data.user) {
        const metadata = data.user.user_metadata || {};
        const userRole = metadata.role || role;
        const name = metadata.full_name || fullName;
        const cName = metadata.centre_name || centreName;

        showToast(`Welcome back, ${name}!`);
        setupUserSessionFromSupabase(data.user, userRole, name, cName);
      }
    } catch (err) {
      console.error(err);
      setupUserSessionFromSupabase({ email }, role, fullName, centreName);
    }
  }
}

function setupUserSessionFromSupabase(user, role, fullName, centreName) {
  const profileKey = role;
  const baseProfile = PROFILES[profileKey] || PROFILES.farmer;

  state.currentUser = {
    ...baseProfile,
    id: user?.id ? `KS-${user.id.substring(0, 6).toUpperCase()}` : baseProfile.id,
    name: fullName || baseProfile.name,
    role: role,
    location: role === 'procurement_centre' ? `${centreName}` : baseProfile.location,
    avatar: (fullName || 'KS').substring(0, 2).toUpperCase()
  };

  if (role === 'procurement_centre' && centreName) {
    state.queue.depotName = centreName;
    const staffTitle = document.getElementById('staffCentreTitle');
    if (staffTitle) staffTitle.textContent = centreName;
  }

  updateNavForRole();
  toggleLoginModal(false);
  switchView(baseProfile.primaryView);
}

// 3-Tier Profile Definitions & Permissions Matrix
const PROFILES = {
  farmer: {
    id: 'KS-F10293',
    name: 'Ramesh Kumar',
    role: 'farmer',
    roleName: 'Farmer',
    roleBadge: '🌾 Farmer Profile',
    roleBadgeClass: 'badge-farmer',
    designation: 'Registered Farmer (Paddy & Wheat)',
    location: 'Village Rampur, Karnal, Haryana',
    avatar: 'RK',
    primaryView: 'dashboard',
    allowedViews: ['landing', 'dashboard', 'booking', 'confirmation', 'queue', 'procurement', 'payments', 'history', 'map', 'notifications'],
    tagline: 'Farmer Portal — Slot Booking & Live Track',
    badgeText: 'Tier 1: Farmer'
  },
  procurement_centre: {
    id: 'PC-KRN-04',
    name: 'Insp. Suresh Verma',
    role: 'procurement_centre',
    roleName: 'Procurement Centre',
    roleBadge: '🏢 Procurement Centre Profile',
    roleBadgeClass: 'badge-staff',
    designation: 'Mandi Depot Manager & Inspector',
    location: 'XYZ Mandi Depot, Karnal District',
    avatar: 'SV',
    primaryView: 'staff',
    allowedViews: ['landing', 'staff', 'queue', 'map', 'notifications'],
    tagline: 'Procurement Centre Portal — Gate Check-in & Quality Log',
    badgeText: 'Tier 2: Mandi Staff'
  },
  central_government: {
    id: 'GOV-IND-8821',
    name: 'Dr. Ananya Sharma',
    role: 'central_government',
    roleName: 'Central Government',
    roleBadge: '🏛️ Central Govt Profile',
    roleBadgeClass: 'badge-admin',
    designation: 'Joint Secretary (MSP & Procurement Ops)',
    location: 'Ministry of Ag, Krishi Bhawan, New Delhi',
    avatar: 'AS',
    primaryView: 'admin',
    allowedViews: ['landing', 'admin', 'map', 'queue', 'notifications'],
    tagline: 'Central Govt Portal — National Analytics & Policy Control',
    badgeText: 'Tier 3: Central Govt'
  }
};

// Shared Reactive State Store
const state = {
  currentView: 'landing',
  language: 'en',
  currentUser: PROFILES.farmer, // Default logged-in profile
  farmer: {
    name: 'Ramesh Kumar',
    id: 'KS-F10293',
    village: 'Rampur',
    district: 'Karnal, Haryana',
    bank: 'State Bank of India (****4921)'
  },
  activeBooking: {
    crop: 'Paddy',
    cropHindi: 'धान',
    mspRate: 2300,
    quantity: 32,
    centre: 'XYZ Procurement Centre',
    date: '10 September 2026',
    timeSlot: '10:00 AM – 11:00 AM',
    arrivalTime: '10:30 AM',
    window: '10:15 AM – 10:45 AM',
    token: 'A107'
  },
  queue: {
    servingTokenNum: 102,
    userTokenNum: 107,
    avgProcessingMin: 4.8,
    activeCounters: 3,
    depotName: 'XYZ Procurement Centre'
  },
  bookingWizard: {
    step: 1,
    selectedCrop: 'Paddy',
    selectedUnit: 'quintal',
    rawQuantity: 32,
    quantityQuintals: 32,
    quantity: 32,
    selectedCentre: 'XYZ Procurement Centre',
    selectedDate: '10 September 2026',
    selectedSlot: '10:00 AM – 11:00 AM',
    selectedTime: '10:30 AM'
  },
  procurement: {
    actualWeight: 31.8,
    qualityGrade: 'Grade A (Premium)',
    stageIndex: 4 // 0: Booked, 1: CheckedIn, 2: Verified, 3: Weighed, 4: Quality, 5: Completed, 6: PayProcessing, 7: PayDone
  },
  history: [
    { date: '10 Sep 2026', id: 'PRC10293', crop: 'Paddy', centre: 'XYZ Procurement Centre', q: '31.8 Q', amount: '₹73,140', status: 'Processing', badgeClass: 'badge-warning' },
    { date: '21 Aug 2026', id: 'PRC09812', crop: 'Paddy', centre: 'XYZ Procurement Centre', q: '28.0 Q', amount: '₹64,400', status: 'Paid', badgeClass: 'badge-success' },
    { date: '05 Aug 2026', id: 'PRC08124', crop: 'Maize', centre: 'ABC Procurement Centre', q: '15.0 Q', amount: '₹31,350', status: 'Paid', badgeClass: 'badge-success' },
    { date: '12 May 2026', id: 'PRC05411', crop: 'Wheat', centre: 'Karnal Yard #3', q: '45.0 Q', amount: '₹1,02,375', status: 'Paid', badgeClass: 'badge-success' }
  ]
};

// Multilingual Dictionary
const i18n = {
  en: {
    govBadge: 'Govt Portal',
    tagline: 'Smarter Procurement. Less Waiting.',
    navHome: 'Home',
    navDashboard: 'Dashboard',
    navBook: 'Book Slot',
    navQueue: 'Live Queue',
    navProcurement: 'Procurement',
    navPayments: 'Payments',
    navMorePortals: 'More Portals',
    navHistory: 'Procurement History',
    navMap: 'Centre Map',
    navStaff: 'Centre Staff Portal',
    navAdmin: 'District Admin Portal',
    heroTitle: 'Procurement Made Simple for Every Farmer',
    heroSubtitle: 'Book your procurement time slot online, track your Mandi queue status in real time, and monitor procurement payments directly with zero waiting stress.',
    btnBookSlot: 'Book a Procurement Slot ➔',
    btnTrackProcurement: 'Track My Procurement',
    trustStatement: 'Designed to reduce congestion, waiting time, and uncertainty at agricultural procurement centres.',
    viewLiveToken: 'View Token A107 ➔',
    mNavHome: 'Home',
    mNavDash: 'Dash',
    mNavBook: 'Book',
    mNavQueue: 'Queue',
    mNavPay: 'Payouts',
    switchRoleBtn: 'Switch Profile Login',
    accessRestrictedTitle: 'Access Restricted',
    accessRestrictedDesc: 'Your active profile tier does not have authorization to view this portal area.'
  },
  hi: {
    govBadge: 'सरकारी पोर्टल',
    tagline: 'स्मार्ट खरीद। कम प्रतीक्षा समय।',
    navHome: 'मुख्य पृष्ठ',
    navDashboard: 'डैशबोर्ड',
    navBook: 'स्लॉट बुक करें',
    navQueue: 'लाइव कतार',
    navProcurement: 'फसल खरीद',
    navPayments: 'भुगतान स्थिति',
    navMorePortals: 'अन्य पोर्टल',
    navHistory: 'खरीद इतिहास',
    navMap: 'केन्द्र मानचित्र',
    navStaff: 'स्टाफ पोर्टल',
    navAdmin: 'जिला प्रशासन',
    heroTitle: 'हर किसान के लिए मंडी खरीद हुई आसान',
    heroSubtitle: 'अपनी फसल खरीद का समय ऑनलाइन बुक करें, मंडी की लाइन की स्थिति लाइव देखें और बिना किसी परेशानी के सीधे अपने बैंक खाते में भुगतान ट्रैक करें।',
    btnBookSlot: 'खरीद स्लॉट बुक करें ➔',
    btnTrackProcurement: 'अपनी खरीद ट्रैक करें',
    trustStatement: 'मंडी में भीड़, इंतजार का समय और अनिश्चितता कम करने के लिए डिज़ाइन किया गया।',
    viewLiveToken: 'टोकन A107 देखें ➔',
    mNavHome: 'गृह',
    mNavDash: 'डैश',
    mNavBook: 'बुकिंग',
    mNavQueue: 'लाइन',
    mNavPay: 'भुगतान',
    switchRoleBtn: 'प्रोफाइल लॉगिन बदलें',
    accessRestrictedTitle: 'पहुंच सीमित है',
    accessRestrictedDesc: 'आपकी वर्तमान प्रोफाइल के पास इस पोर्टल अनुभाग तक पहुंचने की अनुमति नहीं है।'
  },
  as: {
    govBadge: 'চৰকাৰী পৰ্টেল',
    tagline: 'স্মাৰ্ট ক্ৰয়। কম অপেক্ষাৰ সময়।',
    navHome: 'মুখ্য পৃষ্ঠা',
    navDashboard: 'ডেচব’ৰ্ড',
    navBook: 'স্লট বুক কৰক',
    navQueue: 'লাইভ শাৰী',
    navProcurement: 'শস্য ক্ৰয়',
    navPayments: 'পৰিশোধ স্থিতি',
    navMorePortals: 'অন্যান্য পৰ্টেল',
    navHistory: 'ক্ৰয় ইতিবৃত্ত',
    navMap: 'কেন্দ্ৰ মেপ',
    navStaff: 'স্টাফ পৰ্টেল',
    navAdmin: 'জিলা প্ৰশাসন',
    heroTitle: 'প্ৰতিগৰাকী কৃষকৰ বাবে শস্য ক্ৰয় সহজ কৰা হ’ল',
    heroSubtitle: 'অনলাইন শস্য ক্ৰয়ৰ সময় বুক কৰক, লাইভ শাৰী নিৰীক্ষণ কৰক আৰু পোনে পোনে বেংক একাউণ্টৰ ধন পৰিশোধ পৰীক্ষা কৰক।',
    btnBookSlot: 'ক্ৰয় স্লট বুক কৰক ➔',
    btnTrackProcurement: 'ক্ৰয় স্থিতি ট্ৰেক কৰক',
    trustStatement: 'বজাৰত ভিৰ আৰু অপেক্ষাৰ সময় হ্ৰাস কৰাৰ বাবে প্ৰস্তুত কৰা হৈছে।',
    viewLiveToken: 'টোকেন A107 চাওক ➔',
    mNavHome: 'গৃহ',
    mNavDash: 'ডেচ',
    mNavBook: 'বুকিং',
    mNavQueue: 'শাৰী',
    mNavPay: 'পৰিশোধ',
    switchRoleBtn: 'প্ৰফাইল লগইন সলনি কৰক',
    accessRestrictedTitle: 'প্রৱেশ সীমিত',
    accessRestrictedDesc: 'আপোনাৰ বর্তমান প্ৰফাইলৰ এই পৰ্টেল চাবলৈ অনুমতি নাই।'
  }
};

// Initialize Application
document.addEventListener('DOMContentLoaded', () => {
  initSupabase();
  setupDropdowns();
  updateQueueDisplays();
  renderAdminCharts();
  updateNavForRole();
  updateQuantityUnitCalculations();
});

// View Switcher & RBAC Function
function switchView(viewId) {
  const user = state.currentUser || PROFILES.farmer;
  const isAllowed = user.allowedViews.includes(viewId);

  if (!isAllowed) {
    showRestrictedAccess(viewId);
    return;
  }

  state.currentView = viewId;

  // Toggle active view sections
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));

  const targetView = document.getElementById(`view-${viewId}`);
  if (targetView) {
    targetView.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  // Update navbar links active state
  updateNavActiveState(viewId);

  // Hide portal dropdown if open
  const dropdown = document.getElementById('portalDropdown');
  if (dropdown) dropdown.classList.remove('show');
  const profileDropdown = document.getElementById('profileDropdown');
  if (profileDropdown) profileDropdown.classList.remove('show');

  // Trigger charts if switching to admin view
  if (viewId === 'admin') {
    setTimeout(renderAdminCharts, 100);
  }
}

// Update Active Nav Link State
function updateNavActiveState(viewId) {
  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
    if (link.dataset.view === viewId) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });

  const mNavItems = document.querySelectorAll('.mobile-nav-item');
  mNavItems.forEach(item => {
    if (item.dataset.view === viewId) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });
}

// Show Access Restricted View Screen
function showRestrictedAccess(requestedViewId) {
  // Determine which profile is required
  let requiredRole = 'farmer';
  let requiredRoleName = 'Farmer';
  let requiredRoleBadge = '🌾 Farmer Profile';

  if (requestedViewId === 'admin') {
    requiredRole = 'central_government';
    requiredRoleName = 'Central Government';
    requiredRoleBadge = '🏛️ Central Government Profile';
  } else if (requestedViewId === 'staff') {
    requiredRole = 'procurement_centre';
    requiredRoleName = 'Procurement Centre';
    requiredRoleBadge = '🏢 Procurement Centre Profile';
  }

  const viewNameMap = {
    admin: 'District & National Admin Portal',
    staff: 'Centre Staff & Mandi Inspector Portal',
    booking: 'Farmer Slot Booking Wizard',
    dashboard: 'Farmer Personal Dashboard',
    payments: 'Farmer Direct Payouts Portal',
    history: 'Farmer Procurement History',
    procurement: 'Farmer Live Procurement Tracker'
  };

  const requestedViewTitle = viewNameMap[requestedViewId] || requestedViewId.toUpperCase();

  // Populate Restricted View details
  const targetTitleEl = document.getElementById('restrictedViewTitle');
  const currentRoleEl = document.getElementById('restrictedCurrentRole');
  const neededRoleEl = document.getElementById('restrictedNeededRole');
  const actionBtnEl = document.getElementById('restrictedActionBtn');

  if (targetTitleEl) targetTitleEl.textContent = requestedViewTitle;
  if (currentRoleEl) currentRoleEl.textContent = `${state.currentUser.roleBadge} (${state.currentUser.name})`;
  if (neededRoleEl) neededRoleEl.textContent = requiredRoleBadge;

  if (actionBtnEl) {
    actionBtnEl.setAttribute('onclick', `loginAsRole('${requiredRole}')`);
    actionBtnEl.textContent = `⚡ Log in as ${requiredRoleName} to Access`;
  }

  // Hide all sections and show restricted view section
  const sections = document.querySelectorAll('.view-section');
  sections.forEach(sec => sec.classList.remove('active'));

  const restrictedSection = document.getElementById('view-restricted');
  if (restrictedSection) {
    restrictedSection.classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

// Login & Role Switcher Logic
function loginAsRole(roleKey, notify = true) {
  const profile = PROFILES[roleKey];
  if (!profile) return;

  state.currentUser = profile;
  
  // Update Navbar UI
  updateNavForRole();

  // Close Login Modal if open
  toggleLoginModal(false);

  // Toast notification
  if (notify) {
    showToast(`Logged in successfully as ${profile.roleBadge} (${profile.name})`);
  }

  // Redirect to role primary dashboard
  switchView(profile.primaryView);
}

function logout() {
  showToast('Logged out of active profile session.');
  toggleLoginModal(true);
}

// Update Nav UI Elements according to Current User Role
function updateNavForRole() {
  const user = state.currentUser || PROFILES.farmer;

  // Update Profile Pill & Badges
  const avatarEl = document.getElementById('navUserAvatar');
  const nameEl = document.getElementById('navUserName');
  const idEl = document.getElementById('navUserId');
  const roleBadgeEl = document.getElementById('navRoleBadge');

  if (avatarEl) avatarEl.textContent = user.avatar;
  if (nameEl) nameEl.textContent = user.name;
  if (idEl) idEl.textContent = user.id;
  if (roleBadgeEl) {
    roleBadgeEl.textContent = user.badgeText;
    roleBadgeEl.className = `role-badge-pill ${user.roleBadgeClass}`;
  }

  // Update Profile Dropdown Drawer Details
  const ddAvatar = document.getElementById('ddUserAvatar');
  const ddName = document.getElementById('ddUserName');
  const ddId = document.getElementById('ddUserId');
  const ddRole = document.getElementById('ddUserRole');
  const ddDesig = document.getElementById('ddUserDesig');
  const ddLoc = document.getElementById('ddUserLoc');

  if (ddAvatar) ddAvatar.textContent = user.avatar;
  if (ddName) ddName.textContent = user.name;
  if (ddId) ddId.textContent = user.id;
  if (ddRole) ddRole.textContent = user.roleBadge;
  if (ddDesig) ddDesig.textContent = user.designation;
  if (ddLoc) ddLoc.textContent = user.location;

  // Filter Main Nav Links
  const navLinks = document.querySelectorAll('.nav-menu .nav-link:not(.dropdown-toggle)');
  navLinks.forEach(link => {
    const view = link.dataset.view;
    if (!view) return;
    if (user.allowedViews.includes(view)) {
      link.style.display = 'inline-flex';
    } else {
      link.style.display = 'none';
    }
  });

  // Filter Mobile Nav Bar
  const mNavItems = document.querySelectorAll('.mobile-bottom-nav .mobile-nav-item');
  mNavItems.forEach(item => {
    const view = item.dataset.view;
    if (!view) return;

    if (user.role === 'farmer') {
      // Show default farmer mobile nav
      item.style.display = 'flex';
    } else if (user.role === 'procurement_centre') {
      // Map mobile nav for staff
      if (['landing', 'staff', 'queue', 'map'].includes(view)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    } else if (user.role === 'central_government') {
      // Map mobile nav for admin
      if (['landing', 'admin', 'queue', 'map'].includes(view)) {
        item.style.display = 'flex';
      } else {
        item.style.display = 'none';
      }
    }
  });
}

// Modal Toggle Helper
function toggleLoginModal(show) {
  const modal = document.getElementById('loginModal');
  if (modal) {
    if (show) {
      modal.classList.add('active');
    } else {
      modal.classList.remove('active');
    }
  }
}

// Login Modal Tab Switcher
function switchLoginTab(roleKey) {
  const tabs = document.querySelectorAll('.login-tab-btn');
  tabs.forEach(t => {
    if (t.dataset.role === roleKey) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  const contents = document.querySelectorAll('.login-tab-content');
  contents.forEach(c => {
    if (c.dataset.role === roleKey) {
      c.classList.add('active');
    } else {
      c.classList.remove('active');
    }
  });
}

// Handle Form Submission for custom inputs
function handleLoginFormSubmit(event, roleKey) {
  event.preventDefault();
  loginAsRole(roleKey);
}

// Toast Notification Helper
function showToast(msg) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.className = 'toast-notification';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => {
    toast.classList.remove('show');
  }, 3500);
}

// Setup Dropdowns Helper
function setupDropdowns() {
  const btn = document.getElementById('portalDropdownBtn');
  const dropdown = document.getElementById('portalDropdown');

  if (btn && dropdown) {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
    });
  }

  const profileBtn = document.getElementById('profilePillBtn');
  const profileDropdown = document.getElementById('profileDropdown');

  if (profileBtn && profileDropdown) {
    profileBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      profileDropdown.classList.toggle('show');
    });
  }

  document.addEventListener('click', () => {
    if (dropdown) dropdown.classList.remove('show');
    if (profileDropdown) profileDropdown.classList.remove('show');
  });
}

// Multilingual Switcher
function changeLanguage(langCode) {
  state.language = langCode;
  const dict = i18n[langCode] || i18n.en;

  const elements = document.querySelectorAll('[data-i18n]');
  elements.forEach(el => {
    const key = el.getAttribute('data-i18n');
    if (dict[key]) {
      el.textContent = dict[key];
    }
  });
}

// ================= WIZARD LOGIC =================
function goToWizardStep(stepNum) {
  state.bookingWizard.step = stepNum;

  // Update Stepper indicators
  for (let i = 1; i <= 5; i++) {
    const ind = document.getElementById(`stepInd${i}`);
    const line = document.getElementById(`line${i}`);
    const content = document.getElementById(`wizardStep${i}`);

    if (ind) {
      if (i <= stepNum) {
        ind.classList.add('active');
      } else {
        ind.classList.remove('active');
      }
    }
    if (line) {
      if (i < stepNum) {
        line.classList.add('active');
      } else {
        line.classList.remove('active');
      }
    }
    if (content) {
      if (i === stepNum) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    }
  }

  // Update Step 4 date display if step 4
  if (stepNum === 4) {
    const step4SelectedDate = document.getElementById('step4SelectedDate');
    if (step4SelectedDate) {
      step4SelectedDate.textContent = state.bookingWizard.selectedDate;
    }
  }

  // Update Summary step text if step 5
  if (stepNum === 5) {
    updateBookingSummaryView();
  }
}

function updateCropSelection(cropName) {
  state.bookingWizard.selectedCrop = cropName;
  const cropHindiMap = {
    'Paddy': 'धान',
    'Wheat': 'गेहूँ',
    'Maize': 'मक्का',
    'Other': 'अन्य'
  };
  state.bookingWizard.selectedCropHindi = cropHindiMap[cropName] || cropName;
  
  const cards = document.querySelectorAll('.crop-radio-card');
  cards.forEach(card => {
    const radio = card.querySelector('input');
    if (radio && radio.value === cropName) {
      card.classList.add('active');
      radio.checked = true;
    } else {
      card.classList.remove('active');
    }
  });
  updateQuantityUnitCalculations();
}

function selectQuantityUnit(unit, updateDropdown = false) {
  state.bookingWizard.selectedUnit = unit;
  
  const unitPills = document.querySelectorAll('#unitPillGroup .unit-pill');
  unitPills.forEach(pill => {
    if (pill.dataset.unit === unit) {
      pill.classList.add('active');
    } else {
      pill.classList.remove('active');
    }
  });

  if (updateDropdown) {
    const unitSelect = document.getElementById('unitSelect');
    if (unitSelect) unitSelect.value = unit;
  }

  updateQuantityUnitCalculations();
}

function handleQuantityChange() {
  const qtyInput = document.getElementById('quantityInput');
  const qty = parseFloat(qtyInput?.value) || 0;
  state.bookingWizard.rawQuantity = qty;
  updateQuantityUnitCalculations();
}

function updateQuantityUnitCalculations() {
  const unit = state.bookingWizard.selectedUnit || 'quintal';
  const rawQty = state.bookingWizard.rawQuantity || 32;
  
  let qtyQuintals;
  switch (unit) {
    case 'quintal':
      qtyQuintals = rawQty;
      break;
    case 'kg':
      qtyQuintals = rawQty / 100;
      break;
    case 'tonne':
      qtyQuintals = rawQty * 10;
      break;
    case 'bag':
      qtyQuintals = (rawQty * 50) / 100;
      break;
    default:
      qtyQuintals = rawQty;
  }
  
  state.bookingWizard.quantityQuintals = qtyQuintals;
  state.bookingWizard.quantity = qtyQuintals;

  const crop = state.bookingWizard.selectedCrop || 'Paddy';
  let rate = 2300;
  if (crop === 'Wheat') rate = 2275;
  if (crop === 'Maize') rate = 2090;
  if (crop === 'Other') rate = 0;

  const unitLabels = {
    quintal: 'Quintal (Q)',
    kg: 'Kilogram (kg)',
    tonne: 'Metric Tonne (MT)',
    bag: 'Bag (50kg)'
  };

  const unitShortLabels = {
    quintal: 'Q',
    kg: 'kg',
    tonne: 'MT',
    bag: 'Bags'
  };

  let displayRate, displayRateLabel;
  switch (unit) {
    case 'quintal':
      displayRate = rate;
      displayRateLabel = `₹${rate.toLocaleString('en-IN')} / Quintal`;
      break;
    case 'kg':
      displayRate = rate / 100;
      displayRateLabel = `₹${displayRate.toFixed(2)} / kg`;
      break;
    case 'tonne':
      displayRate = rate * 10;
      displayRateLabel = `₹${displayRate.toLocaleString('en-IN')} / MT`;
      break;
    case 'bag':
      displayRate = (rate * 50) / 100;
      displayRateLabel = `₹${displayRate.toFixed(2)} / Bag (50kg)`;
      break;
    default:
      displayRate = rate;
      displayRateLabel = `₹${rate.toLocaleString('en-IN')} / Quintal`;
  }

  const convQuintals = document.getElementById('convQuintals');
  const convKgTonnes = document.getElementById('convKgTonnes');
  const convBags = document.getElementById('convBags');
  const unitEstPayout = document.getElementById('unitEstPayout');
  const unitRateBadge = document.getElementById('unitRateBadge');
  const unitHelpText = document.getElementById('unitHelpText');

  if (convQuintals) convQuintals.textContent = `${qtyQuintals.toFixed(1)} Q`;
  if (convKgTonnes) {
    const kg = qtyQuintals * 100;
    const tonnes = qtyQuintals / 10;
    convKgTonnes.textContent = `${kg.toLocaleString('en-IN')} kg (${tonnes.toFixed(1)} MT)`;
  }
  if (convBags) convBags.textContent = `${Math.round(qtyQuintals * 2)} Bags`;

  const estValue = qtyQuintals * rate;
  if (unitEstPayout) unitEstPayout.textContent = `₹${estValue.toLocaleString('en-IN')}`;
  if (unitRateBadge) unitRateBadge.textContent = `MSP: ${displayRateLabel}`;

  if (unitHelpText) {
    const maxQuintals = 500;
    let maxInUnit;
    switch (unit) {
      case 'quintal': maxInUnit = maxQuintals; break;
      case 'kg': maxInUnit = maxQuintals * 100; break;
      case 'tonne': maxInUnit = maxQuintals / 10; break;
      case 'bag': maxInUnit = maxQuintals * 2; break;
      default: maxInUnit = maxQuintals;
    }
    unitHelpText.textContent = `1 Quintal = 100 kg = 0.1 MT = 2 Bags (50kg). Max allowed: ${maxInUnit.toLocaleString('en-IN')} ${unitShortLabels[unit]}.`;
  }

  const quantityInput = document.getElementById('quantityInput');
  if (quantityInput) {
    quantityInput.max = maxInUnit;
  }
}

function selectCentre(centreName, cardIdx) {
  state.bookingWizard.selectedCentre = centreName;
  const cards = document.querySelectorAll('#centreSelectionList .centre-card');
  cards.forEach((card, idx) => {
    if (idx === cardIdx) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

let calendarState = {
  monthIndex: 8, // September (0-indexed: 8 = September)
  year: 2026
};

const monthNames = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

function selectDate(dateStr, targetEl) {
  state.bookingWizard.selectedDate = dateStr;
  
  const selectedDateDisplay = document.getElementById('selectedDateDisplay');
  if (selectedDateDisplay) {
    selectedDateDisplay.textContent = dateStr;
  }

  const step4SelectedDate = document.getElementById('step4SelectedDate');
  if (step4SelectedDate) {
    step4SelectedDate.textContent = dateStr;
  }

  // Toggle visual selected state on calendar day elements
  const calDays = document.querySelectorAll('#calendarGrid .cal-day:not(.cal-day-label)');
  calDays.forEach(day => {
    if (day.classList.contains('disabled')) return;

    if (targetEl) {
      if (day === targetEl) {
        day.classList.add('selected');
      } else {
        day.classList.remove('selected');
      }
    } else {
      const onclickAttr = day.getAttribute('onclick');
      const daySpan = day.querySelector('span');
      const dayText = daySpan ? daySpan.textContent.trim() : '';
      if ((onclickAttr && onclickAttr.includes(`'${dateStr}'`)) || (dayText && dateStr.startsWith(dayText))) {
        day.classList.add('selected');
      } else {
        day.classList.remove('selected');
      }
    }
  });
}

function navigateCalendarMonth(direction) {
  calendarState.monthIndex += direction;
  if (calendarState.monthIndex > 11) {
    calendarState.monthIndex = 0;
    calendarState.year++;
  } else if (calendarState.monthIndex < 0) {
    calendarState.monthIndex = 11;
    calendarState.year--;
  }

  const calMonthYearHeader = document.getElementById('calMonthYear');
  if (calMonthYearHeader) {
    calMonthYearHeader.textContent = `${monthNames[calendarState.monthIndex]} ${calendarState.year}`;
  }

  renderCalendarDays();
}

function renderCalendarDays() {
  const grid = document.getElementById('calendarGrid');
  if (!grid) return;

  const currentMonthName = monthNames[calendarState.monthIndex];
  const year = calendarState.year;

  // Remove existing day cells (keeping header labels)
  const existingDays = grid.querySelectorAll('.cal-day');
  existingDays.forEach(d => d.remove());

  const firstDayIndex = new Date(year, calendarState.monthIndex, 1).getDay();
  const totalDays = new Date(year, calendarState.monthIndex + 1, 0).getDate();
  const prevMonthTotalDays = new Date(year, calendarState.monthIndex, 0).getDate();

  // Offset days from previous month
  for (let i = firstDayIndex - 1; i >= 0; i--) {
    const disabledDiv = document.createElement('div');
    disabledDiv.className = 'cal-day disabled';
    disabledDiv.textContent = prevMonthTotalDays - i;
    grid.appendChild(disabledDiv);
  }

  // Active month days
  for (let day = 1; day <= totalDays; day++) {
    const dayDiv = document.createElement('div');
    const formattedDate = `${day} ${currentMonthName} ${year}`;
    const currentDateObj = new Date(year, calendarState.monthIndex, day);
    const minDateObj = new Date(2026, 8, 10); // Sep 10 2026

    if (currentDateObj < minDateObj) {
      dayDiv.className = 'cal-day disabled';
      dayDiv.textContent = day;
    } else {
      const isSelected = state.bookingWizard.selectedDate.includes(`${day} ${currentMonthName}`);
      dayDiv.className = `cal-day ${isSelected ? 'selected' : ''}`;
      const dotColor = (day % 3 === 0) ? 'amber' : 'green';
      dayDiv.innerHTML = `<span>${day}</span><span class="cal-dot ${dotColor}"></span>`;
      dayDiv.onclick = function() {
        selectDate(formattedDate, this);
      };
    }
    grid.appendChild(dayDiv);
  }
}

function selectSlot(slotWindow, arrivalTime) {
  state.bookingWizard.selectedSlot = slotWindow;
  state.bookingWizard.selectedTime = arrivalTime;

  const slotCards = document.querySelectorAll('#slotsGrid .slot-card');
  slotCards.forEach(card => {
    if (card.querySelector('.slot-time')?.textContent.trim() === slotWindow) {
      card.classList.add('selected');
    } else {
      card.classList.remove('selected');
    }
  });
}

function updateBookingSummaryView() {
  const qtyInput = document.getElementById('quantityInput');
  const rawQty = qtyInput ? parseFloat(qtyInput.value) || 32 : 32;
  const unit = state.bookingWizard.selectedUnit || 'quintal';
  
  let qtyQuintals;
  switch (unit) {
    case 'quintal': qtyQuintals = rawQty; break;
    case 'kg': qtyQuintals = rawQty / 100; break;
    case 'tonne': qtyQuintals = rawQty * 10; break;
    case 'bag': qtyQuintals = (rawQty * 50) / 100; break;
    default: qtyQuintals = rawQty;
  }
  
  state.bookingWizard.quantityQuintals = qtyQuintals;
  state.bookingWizard.quantity = qtyQuintals;

  const unitLabels = {
    quintal: 'Quintal(s)',
    kg: 'Kilogram(s)',
    tonne: 'Metric Tonne(s)',
    bag: 'Bag(s) (50kg each)'
  };

  const unitShortLabels = {
    quintal: 'Q',
    kg: 'kg',
    tonne: 'MT',
    bag: 'Bags'
  };

  document.getElementById('sumCrop').textContent = state.bookingWizard.selectedCrop;
  document.getElementById('sumQuantity').textContent = `${rawQty} ${unitLabels[unit]}`;
  document.getElementById('sumCentre').textContent = state.bookingWizard.selectedCentre;
  document.getElementById('sumDate').textContent = state.bookingWizard.selectedDate;
  document.getElementById('sumSlot').textContent = state.bookingWizard.selectedSlot;

  let rate = 2300;
  if (state.bookingWizard.selectedCrop === 'Wheat') rate = 2275;
  if (state.bookingWizard.selectedCrop === 'Maize') rate = 2090;

  const estVal = qtyQuintals * rate;
  document.getElementById('sumMsp').textContent = `₹${estVal.toLocaleString('en-IN')} (₹${rate.toLocaleString('en-IN')} / Q)`;
}

function confirmFinalBooking() {
  // Generate mock token
  const newNum = state.queue.userTokenNum + 1;
  const newToken = `A${newNum}`;
  state.queue.userTokenNum = newNum;

  const rawQty = state.bookingWizard.rawQuantity || 32;
  const unit = state.bookingWizard.selectedUnit || 'quintal';
  const qtyQuintals = state.bookingWizard.quantityQuintals || rawQty;

  state.activeBooking.crop = state.bookingWizard.selectedCrop;
  state.activeBooking.cropHindi = state.bookingWizard.selectedCropHindi || state.bookingWizard.selectedCrop;
  state.activeBooking.quantity = qtyQuintals;
  state.activeBooking.rawQuantity = rawQty;
  state.activeBooking.unit = unit;
  state.activeBooking.centre = state.bookingWizard.selectedCentre;
  state.activeBooking.date = state.bookingWizard.selectedDate;
  state.activeBooking.timeSlot = state.bookingWizard.selectedTime;
  state.activeBooking.token = newToken;

  // Update confirmation UI
  document.getElementById('confTokenCode').textContent = newToken;
  document.getElementById('confCentre').textContent = state.bookingWizard.selectedCentre;
  document.getElementById('confDateTime').textContent = `${state.bookingWizard.selectedDate}, ${state.bookingWizard.selectedTime}`;
  
  updateConfirmationQuantityDisplay();
  updateDashboardQuantityDisplay();
  updateReceiptAndStaffDisplays();

  // Update Dashboard token
  document.getElementById('dashTokenCode').textContent = newToken;

  // Update Queue displays
  updateQueueDisplays();

  // Generate QR codes for the new token
  generateBookingQrCodes();

  // Persist booking to Supabase database
  syncBookingToSupabase(state.activeBooking);

  switchView('confirmation');
}

function updateConfirmationQuantityDisplay() {
  const rawQty = state.activeBooking.rawQuantity || 32;
  const unit = state.activeBooking.unit || 'quintal';
  const crop = state.activeBooking.crop || 'Paddy';
  const cropHindi = state.activeBooking.cropHindi || 'धान';

  const unitLabels = {
    quintal: 'Quintal(s)',
    kg: 'Kilogram(s)',
    tonne: 'Metric Tonne(s)',
    bag: 'Bag(s) (50kg each)'
  };

  const confQuantity = document.getElementById('confQuantity');
  if (confQuantity) {
    confQuantity.textContent = `${crop} (${rawQty} ${unitLabels[unit]})`;
  }
}

function updateDashboardQuantityDisplay() {
  const rawQty = state.activeBooking.rawQuantity || 32;
  const unit = state.activeBooking.unit || 'quintal';
  const crop = state.activeBooking.crop || 'Paddy';
  const cropHindi = state.activeBooking.cropHindi || 'धान';

  const unitLabels = {
    quintal: 'Quintal(s)',
    kg: 'Kilogram(s)',
    tonne: 'Metric Tonne(s)',
    bag: 'Bag(s) (50kg each)'
  };

  const dashQuantity = document.getElementById('dashQuantity');
  if (dashQuantity) {
    dashQuantity.textContent = `${rawQty} ${unitLabels[unit]}`;
  }
}

function updateReceiptAndStaffDisplays() {
  const rawQty = state.activeBooking.rawQuantity || 32;
  const unit = state.activeBooking.unit || 'quintal';
  const crop = state.activeBooking.crop || 'Paddy';
  const cropHindi = state.activeBooking.cropHindi || 'धान';

  const unitLabels = {
    quintal: 'Quintal(s)',
    kg: 'Kilogram(s)',
    tonne: 'Metric Tonne(s)',
    bag: 'Bag(s) (50kg each)'
  };

  const receiptDeclaredQty = document.getElementById('receiptDeclaredQty');
  if (receiptDeclaredQty) {
    receiptDeclaredQty.textContent = `${rawQty} ${unitLabels[unit]}`;
  }

  const staffDeclaredQty = document.getElementById('staffDeclaredQty');
  if (staffDeclaredQty) {
    staffDeclaredQty.textContent = `${crop} (${rawQty} ${unitLabels[unit]})`;
  }
}

// ================= LIVE QUEUE & STAFF CONTROLS =================
function staffCallNextFarmer() {
  if (state.queue.servingTokenNum < state.queue.userTokenNum + 50) {
    state.queue.servingTokenNum++;
    updateQueueDisplays();
    showToast(`Called Token A${state.queue.servingTokenNum} to Counter #2!`);
    syncQueueToSupabase(state.queue.servingTokenNum, state.queue.depotName);
  }
}

function updateQueueDisplays() {
  const servingTok = `A${state.queue.servingTokenNum}`;
  const userTokNum = state.queue.userTokenNum;
  const userTok = `A${userTokNum}`;
  const farmersAhead = Math.max(0, userTokNum - state.queue.servingTokenNum);
  const estWaitMin = Math.round(farmersAhead * state.queue.avgProcessingMin);

  // Update Dashboard
  const dashAhead = document.getElementById('dashAheadText');
  const dashWait = document.getElementById('dashWaitText');
  const dashServing = document.getElementById('dashServingCode');

  if (dashAhead) dashAhead.textContent = `${farmersAhead} farmers ahead of you`;
  if (dashWait) dashWait.textContent = `${estWaitMin} minutes`;
  if (dashServing) dashServing.textContent = servingTok;

  // Update Live Queue View
  const qServing = document.getElementById('qCurrentlyServing');
  const qUser = document.getElementById('qYourToken');
  const qAhead = document.getElementById('qFarmersAhead');
  const qWait = document.getElementById('qEstWait');

  if (qServing) qServing.textContent = servingTok;
  if (qUser) qUser.textContent = userTok;
  if (qAhead) qAhead.textContent = farmersAhead;
  if (qWait) qWait.textContent = `${estWaitMin} min`;

  // Update Staff View
  const sServing = document.getElementById('staffServingCode');
  const sWaiting = document.getElementById('staffWaitingCount');
  const sNext1 = document.getElementById('staffNext1');
  const sNext2 = document.getElementById('staffNext2');
  const sNext3 = document.getElementById('staffNext3');

  if (sServing) sServing.textContent = servingTok;
  if (sWaiting) sWaiting.textContent = Math.max(1, 17 - (state.queue.servingTokenNum - 102));

  if (sNext1) sNext1.textContent = `A${state.queue.servingTokenNum + 1}`;
  if (sNext2) sNext2.textContent = `A${state.queue.servingTokenNum + 2}`;
  if (sNext3) sNext3.textContent = `A${state.queue.servingTokenNum + 3}`;

  // Update Vertical Queue list
  renderVerticalQueueSequence(servingTok, userTokNum);
}

function renderVerticalQueueSequence(servingTok, userTokNum) {
  const seqContainer = document.getElementById('queueSequenceList');
  if (!seqContainer) return;

  let html = '';
  const currentServingNum = state.queue.servingTokenNum;

  for (let t = 102; t <= userTokNum + 1; t++) {
    const tokStr = `A${t}`;

    if (t === currentServingNum) {
      html += `
        <div class="queue-row serving">
          <div class="tok-bubble">${tokStr}</div>
          <div class="tok-status">
            <strong>Currently Serving (Counter #2)</strong>
            <span>Active Produce Weighing & Quality Verification</span>
          </div>
          <span class="badge badge-success">SERVING ✓</span>
        </div>`;
    } else if (t < currentServingNum) {
      html += `
        <div class="queue-row completed">
          <div class="tok-bubble">${tokStr}</div>
          <div class="tok-status">
            <strong>Token ${tokStr}</strong>
            <span>Procurement Completed</span>
          </div>
          <span class="badge badge-secondary">COMPLETED</span>
        </div>`;
    } else if (t === userTokNum) {
      html += `
        <div class="queue-row user-row">
          <div class="tok-bubble user-tok">${tokStr}</div>
          <div class="tok-status">
            <strong>Token ${tokStr} (YOU — Ramesh Kumar)</strong>
            <span>Recommended Window: 10:15 AM</span>
          </div>
          <span class="badge badge-primary font-bold">YOUR TOKEN ⭐</span>
        </div>`;
    } else {
      html += `
        <div class="queue-row waiting">
          <div class="tok-bubble">${tokStr}</div>
          <div class="tok-status">
            <strong>Token ${tokStr}</strong>
            <span>Waiting in Depot Holding Yard</span>
          </div>
          <span class="badge badge-warning">WAITING</span>
        </div>`;
    }
  }

  seqContainer.innerHTML = html;
}

// Staff Verification Panel Actions
function staffAction(actionType) {
  const feedback = document.getElementById('staffActionFeedback');
  const stageQual = document.getElementById('stageQuality');
  const stageComp = document.getElementById('stageCompleted');
  const stagePayProc = document.getElementById('stagePayProc');
  const stagePayDone = document.getElementById('stagePayDone');

  if (actionType === 'verify') {
    feedback.textContent = '✓ Farmer ID & Land Records Verified successfully!';
    showToast('Farmer ID Verified ✓');
  } else if (actionType === 'weigh') {
    feedback.textContent = '✓ Produce Weighbridge measured: 31.8 Quintals recorded.';
    showToast('Weight recorded: 31.8 Q');
  } else if (actionType === 'quality') {
    feedback.textContent = '✓ Quality Test Passed: Moisture 13.5% (Grade A).';
    if (stageQual) {
      stageQual.className = 'timeline-step done';
      stageQual.querySelector('.step-icon').textContent = '✓';
    }
    showToast('Quality Approved: Grade A');
  } else if (actionType === 'complete') {
    feedback.textContent = '✓ Procurement Completed! Receipt Issued & Treasury DBT Mandate generated.';
    if (stageComp) {
      stageComp.className = 'timeline-step done';
      stageComp.querySelector('.step-icon').textContent = '✓';
    }
    if (stagePayProc) {
      stagePayProc.className = 'timeline-step active';
      stagePayProc.querySelector('.step-icon').textContent = '●';
    }
    showToast('Procurement Completed & Receipt Issued ✓');
  }
}

// ================= FILTER & SEARCH LOGIC =================
function filterHistoryTable() {
  const query = document.getElementById('historySearchInput')?.value.toLowerCase() || '';
  const crop = document.getElementById('historyCropFilter')?.value || 'ALL';
  const status = document.getElementById('historyStatusFilter')?.value || 'ALL';

  const rows = document.querySelectorAll('#historyTableBody tr');
  rows.forEach(row => {
    const text = row.innerText.toLowerCase();
    const matchesQuery = text.includes(query);
    const matchesCrop = crop === 'ALL' || text.includes(crop.toLowerCase());
    const matchesStatus = status === 'ALL' || text.includes(status.toLowerCase());

    if (matchesQuery && matchesCrop && matchesStatus) {
      row.style.display = '';
    } else {
      row.style.display = 'none';
    }
  });
}

function filterNotifs(cat) {
  const tabs = document.querySelectorAll('.notif-filter-tabs .tab-btn');
  tabs.forEach(t => {
    if (t.textContent.trim().startsWith(cat) || (cat === 'ALL' && t.textContent.trim() === 'All')) {
      t.classList.add('active');
    } else {
      t.classList.remove('active');
    }
  });

  const cards = document.querySelectorAll('#notifFullList .notif-card');
  cards.forEach(card => {
    const cardCat = card.dataset.cat;
    if (cat === 'ALL' || cardCat === cat) {
      card.style.display = 'flex';
    } else {
      card.style.display = 'none';
    }
  });
}

function markAllNotificationsRead() {
  const unreadItems = document.querySelectorAll('.unread');
  unreadItems.forEach(el => el.classList.remove('unread'));
  const badge = document.getElementById('notifBadge');
  if (badge) badge.style.display = 'none';
  showToast('All notifications marked as read.');
}

// Modal Helpers
function openRescheduleModal() {
  alert('Reschedule Feature: Select a new date/time slot window for Token A107.');
}
function cancelBooking() {
  if (confirm('Are you sure you want to cancel your slot for Paddy (Token A107)?')) {
    showToast('Slot cancelled successfully.');
  }
}
function downloadReceipt() {
  // Opens the receipt modal for the current active procurement
  openReceiptModal(
    'PRC10293', '10 Sep 2026', 'Paddy', '31.8 Q',
    '₹73,140', 'Processing', 'TXN82931980', 'State Bank of India (****4921)'
  );
}

// Map Inspection
function inspectMapCentre(name, queue, wait, cap, counters, status) {
  document.getElementById('mapCentreTitle').textContent = name;
  document.getElementById('mapCentreQueue').textContent = queue;
  document.getElementById('mapCentreWait').textContent = wait;
  document.getElementById('mapCentreCap').textContent = cap;
  document.getElementById('mapCentreCounters').textContent = `${counters} Active`;

  const badge = document.getElementById('mapCentreBadge');
  if (badge) {
    badge.textContent = `${status} Queue`;
    if (status === 'Low') badge.className = 'badge badge-success';
    else if (status === 'Moderate') badge.className = 'badge badge-warning';
    else badge.className = 'badge badge-danger';
  }
}

// Toast Alert Helper
function showToast(message) {
  let toast = document.getElementById('appToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'appToast';
    toast.style.cssText = `
      position: fixed;
      bottom: 80px;
      right: 20px;
      background: #0f172a;
      color: #fff;
      padding: 12px 20px;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      z-index: 1000;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      transition: all 0.3s ease;
    `;
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  setTimeout(() => {
    toast.style.opacity = '0';
  }, 3000);
}

// Administrative Canvas Charts
function renderAdminCharts() {
  const canvasVol = document.getElementById('chartProcurementVolume');
  if (canvasVol && canvasVol.getContext) {
    const ctx = canvasVol.getContext('2d');
    const width = canvasVol.width = canvasVol.parentElement.clientWidth || 400;
    const height = canvasVol.height = 200;

    ctx.clearRect(0, 0, width, height);

    // Draw Bar Chart
    const data = [420, 680, 950, 1280, 1100, 890, 1340];
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const maxVal = 1500;

    const barWidth = (width - 60) / data.length;

    for (let i = 0; i < data.length; i++) {
      const x = 40 + i * barWidth;
      const barH = (data[i] / maxVal) * (height - 50);
      const y = height - 30 - barH;

      ctx.fillStyle = '#0f766e';
      ctx.fillRect(x + 5, y, barWidth - 10, barH);

      // Label
      ctx.fillStyle = '#64748b';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(labels[i], x + barWidth / 2, height - 10);
    }
  }

  const canvasWait = document.getElementById('chartWaitTimes');
  if (canvasWait && canvasWait.getContext) {
    const ctx = canvasWait.getContext('2d');
    const width = canvasWait.width = canvasWait.parentElement.clientWidth || 400;
    const height = canvasWait.height = 200;

    ctx.clearRect(0, 0, width, height);

    // Draw Line/Bar Chart
    const centres = ['XYZ Depot', 'ABC Depot', 'Yard #3', 'Gharaunda'];
    const times = [28, 85, 35, 52];
    const colors = ['#166534', '#dc2626', '#166534', '#d97706'];

    const barH = 25;
    for (let i = 0; i < times.length; i++) {
      const y = 20 + i * 42;
      const barW = (times[i] / 100) * (width - 120);

      ctx.fillStyle = colors[i];
      ctx.fillRect(100, y, barW, barH);

      ctx.fillStyle = '#0f172a';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(centres[i], 90, y + 17);

      ctx.textAlign = 'left';
      ctx.fillText(`${times[i]} min`, 110 + barW, y + 17);
    }
  }
}

// ============================================================
// QR CODE INTEGRATION — Booking Slot Token System
// ============================================================

// Internal references for QR instances so we can re-render on demand
let _confQrInstance = null;
let _dashQrInstance = null;

/**
 * Builds the QR payload string and (re-)renders both QR canvases.
 * Called every time a booking is confirmed.
 */
function generateBookingQrCodes() {
  const bk = state.activeBooking;

  // Structured payload — scanner can decode full booking details
  const payload = JSON.stringify({
    platform: 'KisanSetu',
    token: bk.token,
    farmer: 'Ramesh Kumar',        // In a real system: state.user.name
    farmerId: 'HR-12345678',       // Aadhaar-linked ID
    crop: bk.crop,
    quantity: `${bk.rawQuantity} ${bk.unit}`,
    centre: bk.centre,
    date: bk.date,
    slot: bk.timeSlot,
    issuedAt: new Date().toISOString(),
    valid: true
  });

  _renderQr('confQrCode', payload, 180, 'conf');
  _renderQr('dashQrCode', payload, 130, 'dash');
}

/**
 * Helper: clears a container and renders a fresh QRCode into it.
 * @param {string} containerId  - DOM element id
 * @param {string} text         - Payload string to encode
 * @param {number} size         - Width/height in pixels
 * @param {'conf'|'dash'} role  - Which instance ref to store
 */
function _renderQr(containerId, text, size, role) {
  const el = document.getElementById(containerId);
  if (!el) return;

  // Clear previous QR
  el.innerHTML = '';

  if (typeof QRCode === 'undefined') {
    // Library not loaded yet — show a friendly fallback
    el.innerHTML = `<p style="font-size:0.8rem;color:#888;padding:1rem">QR library loading…<br>Please reconnect to the internet.</p>`;
    return;
  }

  const instance = new QRCode(el, {
    text: text,
    width: size,
    height: size,
    colorDark: '#14532d',   // deep green — matches KisanSetu brand
    colorLight: '#ffffff',
    correctLevel: QRCode.CorrectLevel.M
  });

  if (role === 'conf') _confQrInstance = instance;
  if (role === 'dash') _dashQrInstance = instance;
}

/** Toggle the dashboard QR panel open/closed */
function toggleDashQr() {
  const content = document.getElementById('dashQrContent');
  const icon    = document.querySelector('#dashQrToggleBtn .qr-toggle-icon');
  const btn     = document.getElementById('dashQrToggleBtn');

  if (!content) return;
  const isOpen = content.style.display !== 'none';

  if (isOpen) {
    content.style.display = 'none';
    if (icon) icon.classList.remove('open');
    if (btn)  btn.querySelector('span:last-child').textContent = 'Show Entry QR Code';
  } else {
    content.style.display = 'block';
    if (icon) icon.classList.add('open');
    if (btn)  btn.querySelector('span:last-child').textContent = 'Hide Entry QR Code';

    // Lazy-render: generate if not yet done (e.g. default booking on page load)
    const canvas = document.querySelector('#dashQrCode canvas, #dashQrCode img');
    if (!canvas) {
      const bk = state.activeBooking;
      const payload = JSON.stringify({
        platform: 'KisanSetu',
        token: bk.token,
        farmer: 'Ramesh Kumar',
        farmerId: 'HR-12345678',
        crop: bk.crop,
        quantity: `${bk.rawQuantity || 32} ${bk.unit || 'quintal'}`,
        centre: bk.centre,
        date: bk.date,
        slot: bk.timeSlot,
        issuedAt: new Date().toISOString(),
        valid: true
      });
      _renderQr('dashQrCode', payload, 130, 'dash');
    }
  }
}

/** Download the confirmation-page QR as a PNG file */
function downloadConfQr() {
  _downloadQrFromContainer('confQrCode', `KisanSetu_Token_${state.activeBooking.token || 'QR'}.png`);
}

/** Download the dashboard QR as a PNG file */
function downloadDashQr() {
  _downloadQrFromContainer('dashQrCode', `KisanSetu_Dashboard_Token_${state.activeBooking.token || 'QR'}.png`);
}

/** Shared download helper — extracts canvas/img from a QR container and triggers download */
function _downloadQrFromContainer(containerId, filename) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // qrcode.js renders a canvas (desktop) or an img (some mobile browsers)
  const canvas = container.querySelector('canvas');
  const img    = container.querySelector('img');

  let dataUrl;
  if (canvas) {
    dataUrl = canvas.toDataURL('image/png');
  } else if (img) {
    dataUrl = img.src;
  } else {
    showToast('QR not ready — please wait a moment and try again.');
    return;
  }

  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  showToast('QR code downloaded! 📥');
}

/** Copy the active token string to the clipboard */
function copyTokenToClipboard() {
  const token = state.activeBooking.token || 'A107';
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(token)
      .then(() => showToast(`Token ${token} copied to clipboard! 📋`))
      .catch(() => _fallbackCopy(token));
  } else {
    _fallbackCopy(token);
  }
}

function _fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  document.execCommand('copy');
  document.body.removeChild(ta);
  showToast(`Token ${text} copied! 📋`);
}

/* ==========================================================================
   PDF RECEIPT GENERATOR SYSTEM
   ========================================================================== */

// Active receipt data store (populated when a modal is opened)
let _activeReceiptData = null;

/**
 * Opens the receipt preview modal with the given procurement data.
 * Called from buttons in Payments, Payments History, and Procurement History.
 */
function openReceiptModal(prcId, date, crop, quantity, amount, status, txnId, bankAccount) {
  _activeReceiptData = { prcId, date, crop, quantity, amount, status, txnId, bankAccount };

  const farmer = state.farmer || {};
  const issuedAt = new Date().toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: true
  });

  const statusClass = status === 'Paid' ? 'receipt-status-paid' :
                      status === 'Processing' ? 'receipt-status-processing' :
                      'receipt-status-pending';
  const statusIcon = status === 'Paid' ? '✅' : status === 'Processing' ? '⏳' : '🔄';

  // Compute MSP and per-quintal rate from amount string
  const numericAmount = amount.replace(/[^0-9]/g, '');
  const qNum = parseFloat(quantity);
  const mspRate = !isNaN(qNum) && qNum > 0 ? Math.round(parseInt(numericAmount) / qNum) : 2300;

  const body = document.getElementById('receiptModalBody');
  if (!body) return;

  body.innerHTML = `
    <div class="receipt-section">
      <div class="receipt-row-two-col">
        <div class="receipt-info-block">
          <div class="receipt-section-label">🧑‍🌾 Farmer Details</div>
          <div class="receipt-detail-row"><span class="rd-label">Name:</span><span class="rd-val">${farmer.name || 'Ramesh Kumar'}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Farmer ID:</span><span class="rd-val font-mono">${farmer.id || 'KS-F10293'}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Village:</span><span class="rd-val">${farmer.village || 'Rampur'}, ${farmer.district || 'Karnal, Haryana'}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Bank A/c:</span><span class="rd-val">${bankAccount}</span></div>
        </div>
        <div class="receipt-info-block">
          <div class="receipt-section-label">📋 Procurement Details</div>
          <div class="receipt-detail-row"><span class="rd-label">Record ID:</span><span class="rd-val font-mono fw-bold">${prcId}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Date:</span><span class="rd-val">${date}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Centre:</span><span class="rd-val">${state.activeBooking?.centre || 'XYZ Procurement Centre'}</span></div>
          <div class="receipt-detail-row"><span class="rd-label">Token:</span><span class="rd-val font-mono">${state.activeBooking?.token || 'A107'}</span></div>
        </div>
      </div>
    </div>

    <div class="receipt-section">
      <div class="receipt-section-label">🌾 Produce & Payment Breakdown</div>
      <table class="receipt-breakdown-table">
        <thead>
          <tr>
            <th>Description</th>
            <th>Quantity</th>
            <th>Rate (MSP)</th>
            <th>Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>${crop} — Grade A (Premium)</td>
            <td>${quantity}</td>
            <td>₹${mspRate.toLocaleString('en-IN')} / Q</td>
            <td class="receipt-amount-cell">${amount}</td>
          </tr>
          <tr class="receipt-deduction-row">
            <td colspan="3">Procurement Service Levy (0%)</td>
            <td>₹0</td>
          </tr>
          <tr class="receipt-total-row">
            <td colspan="3"><strong>Net Payable to Farmer (DBT)</strong></td>
            <td><strong>${amount}</strong></td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="receipt-section receipt-txn-section">
      <div class="receipt-txn-left">
        <div class="receipt-section-label">💳 Transaction Reference</div>
        <div class="receipt-detail-row"><span class="rd-label">Transaction ID:</span><span class="rd-val font-mono">${txnId}</span></div>
        <div class="receipt-detail-row"><span class="rd-label">Payment Mode:</span><span class="rd-val">Direct Benefit Transfer (PFMS)</span></div>
        <div class="receipt-detail-row"><span class="rd-label">Issued On:</span><span class="rd-val">${issuedAt}</span></div>
      </div>
      <div class="receipt-status-badge-box ${statusClass}">
        <div class="receipt-status-icon">${statusIcon}</div>
        <div class="receipt-status-label">Payment Status</div>
        <div class="receipt-status-value">${status}</div>
      </div>
    </div>

    <div class="receipt-legal-note">
      This receipt is issued under the Pradhan Mantri Fasal Bima Yojana / National Food Security Act procurement framework.
      The payment is processed via PFMS and credited directly to the registered bank account via DBT. This document
      is valid as official proof of procurement transaction.
    </div>
  `;

  const modal = document.getElementById('receiptModal');
  if (modal) {
    modal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }
}

/** Close modal when clicking the overlay (outside the box) */
function closeReceiptModal(event) {
  const box = document.getElementById('receiptModalBox');
  if (box && !box.contains(event.target)) {
    closeReceiptModalDirect();
  }
}

/** Directly close the receipt modal */
function closeReceiptModalDirect() {
  const modal = document.getElementById('receiptModal');
  if (modal) {
    modal.classList.remove('show');
    document.body.style.overflow = '';
  }
}

/**
 * Triggered by the "Download PDF Receipt" button inside the modal.
 * Uses jsPDF to generate a branded, styled PDF receipt.
 */
function triggerReceiptDownload() {
  if (!_activeReceiptData) return;
  const d = _activeReceiptData;
  downloadProcurementReceiptPDF(d.prcId, d.date, d.crop, d.quantity, d.amount, d.status, d.txnId, d.bankAccount);
}

/**
 * Core PDF generation function using jsPDF.
 * Generates a fully styled A4 official procurement receipt.
 */
function downloadProcurementReceiptPDF(prcId, date, crop, quantity, amount, status, txnId, bankAccount) {
  if (typeof window.jspdf === 'undefined' && typeof jsPDF === 'undefined') {
    showToast('PDF library loading… Please try again in a moment.');
    return;
  }

  const { jsPDF } = window.jspdf || window;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const farmer = state.farmer || {};
  const W = 210; // A4 width
  const margin = 18;
  const contentW = W - margin * 2;
  let y = 0;

  // ── Helpers ─────────────────────────────────────────────────────────────
  const hex2rgb = (hex) => {
    const r = parseInt(hex.slice(1,3),16);
    const g = parseInt(hex.slice(3,5),16);
    const b = parseInt(hex.slice(5,7),16);
    return [r,g,b];
  };
  const setFill   = (hex) => doc.setFillColor(...hex2rgb(hex));
  const setStroke = (hex) => doc.setDrawColor(...hex2rgb(hex));
  const setColor  = (hex) => doc.setTextColor(...hex2rgb(hex));
  const setFont   = (style, size) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(size);
  };

  // ── Header Band ──────────────────────────────────────────────────────────
  setFill('#0f766e');
  doc.rect(0, 0, W, 38, 'F');
  // Accent stripe
  setFill('#15803d');
  doc.rect(0, 32, W, 6, 'F');

  // Logo circle
  setFill('#ffffff');
  doc.circle(margin + 8, 16, 8, 'F');
  setColor('#0f766e');
  setFont('bold', 10);
  doc.text('KS', margin + 5.5, 19);

  // Brand name
  setColor('#ffffff');
  setFont('bold', 18);
  doc.text('KisanSetu', margin + 20, 14);
  setFont('normal', 8);
  doc.text('Ministry of Agriculture & Farmers Welfare  •  Government of India', margin + 20, 20);
  doc.text('Direct Benefit Transfer — Minimum Support Price (MSP) Procurement Portal', margin + 20, 25);

  // OFFICIAL watermark-style stamp
  setColor('#f0fdf4');
  setFont('bold', 8);
  doc.text('OFFICIAL RECEIPT', W - margin - 2, 12, { align: 'right' });
  setFont('normal', 6.5);
  doc.text('Digitally Issued via PFMS', W - margin - 2, 17, { align: 'right' });
  doc.text(`Receipt No: ${prcId}-RCT`, W - margin - 2, 22, { align: 'right' });

  y = 46;

  // ── Receipt Title ─────────────────────────────────────────────────────────
  setColor('#0f766e');
  setFont('bold', 15);
  doc.text('PROCUREMENT PAYMENT RECEIPT', W / 2, y, { align: 'center' });
  y += 5;

  setColor('#64748b');
  setFont('normal', 8);
  doc.text('This document serves as official proof of agricultural procurement transaction', W/2, y, { align: 'center' });
  y += 10;

  // Thin divider
  setStroke('#e2e8f0');
  doc.setLineWidth(0.3);
  doc.line(margin, y, W - margin, y);
  y += 8;

  // ── Two-column info block ─────────────────────────────────────────────────
  const colW = (contentW - 8) / 2;
  const col2x = margin + colW + 8;

  // Left block — Farmer Info
  setFill('#f0fdf4');
  doc.roundedRect(margin, y, colW, 48, 3, 3, 'F');
  setFill('#0f766e');
  doc.rect(margin, y, colW, 7, 'F');
  setColor('#ffffff');
  setFont('bold', 8);
  doc.text('FARMER DETAILS', margin + 4, y + 5);

  const farmerRows = [
    ['Name', farmer.name || 'Ramesh Kumar'],
    ['Farmer ID', farmer.id || 'KS-F10293'],
    ['Village', `${farmer.village || 'Rampur'}, ${farmer.district || 'Karnal, Haryana'}`],
    ['Bank A/c', bankAccount],
    ['Land Record', 'HR-KISAN-10293']
  ];
  let ly = y + 13;
  farmerRows.forEach(([label, val]) => {
    setColor('#64748b'); setFont('normal', 7.5);
    doc.text(label + ':', margin + 4, ly);
    setColor('#0f172a'); setFont('bold', 7.5);
    doc.text(val, margin + 28, ly);
    ly += 7;
  });

  // Right block — Procurement Info
  setFill('#f0fdf4');
  doc.roundedRect(col2x, y, colW, 48, 3, 3, 'F');
  setFill('#15803d');
  doc.rect(col2x, y, colW, 7, 'F');
  setColor('#ffffff');
  setFont('bold', 8);
  doc.text('PROCUREMENT DETAILS', col2x + 4, y + 5);

  const prcRows = [
    ['Record ID', prcId],
    ['Date', date],
    ['Centre', state.activeBooking?.centre || 'XYZ Procurement Centre'],
    ['Token No.', state.activeBooking?.token || 'A107'],
    ['Slot', state.activeBooking?.timeSlot || '10:00 AM – 11:00 AM']
  ];
  let ry = y + 13;
  prcRows.forEach(([label, val]) => {
    setColor('#64748b'); setFont('normal', 7.5);
    doc.text(label + ':', col2x + 4, ry);
    setColor('#0f172a'); setFont('bold', 7.5);
    doc.text(String(val).substring(0, 28), col2x + 28, ry);
    ry += 7;
  });

  y += 55;

  // ── Produce & Payment Breakdown Table ────────────────────────────────────
  setFill('#0f766e');
  doc.rect(margin, y, contentW, 7, 'F');
  setColor('#ffffff');
  setFont('bold', 8);
  doc.text('PRODUCE & PAYMENT BREAKDOWN', margin + 4, y + 5);
  y += 10;

  // Table header
  const cols = [contentW * 0.38, contentW * 0.18, contentW * 0.22, contentW * 0.22];
  const colHeaders = ['Description', 'Quantity', 'MSP Rate', 'Amount'];
  const colX = [margin];
  for (let i = 1; i < cols.length; i++) colX.push(colX[i-1] + cols[i-1]);

  setFill('#f8fafc');
  doc.rect(margin, y, contentW, 7, 'F');
  setStroke('#e2e8f0');
  doc.setLineWidth(0.2);
  doc.rect(margin, y, contentW, 7, 'S');
  setColor('#475569'); setFont('bold', 7.5);
  colHeaders.forEach((h, i) => doc.text(h, colX[i] + 3, y + 5));
  y += 7;

  // Compute per-quintal rate
  const numericAmount = amount.replace(/[^0-9]/g, '');
  const qNum = parseFloat(quantity);
  const mspRate = !isNaN(qNum) && qNum > 0 ? Math.round(parseInt(numericAmount) / qNum) : 2300;

  // Data row
  const dataRows = [
    [`${crop} — Grade A (Premium)`, quantity, `Rs.${mspRate.toLocaleString('en-IN')}/Q`, amount],
    ['Procurement Service Levy (0%)', '—', '—', 'Rs.0'],
  ];
  dataRows.forEach((row, ri) => {
    const bg = ri % 2 === 0 ? '#ffffff' : '#f8fafc';
    setFill(bg);
    doc.rect(margin, y, contentW, 7, 'F');
    setStroke('#e2e8f0');
    doc.rect(margin, y, contentW, 7, 'S');
    setColor('#0f172a'); setFont('normal', 7.5);
    row.forEach((cell, ci) => doc.text(String(cell), colX[ci] + 3, y + 5));
    y += 7;
  });

  // Total row
  setFill('#f0fdf4');
  doc.rect(margin, y, contentW, 8, 'F');
  setStroke('#0f766e');
  doc.setLineWidth(0.4);
  doc.rect(margin, y, contentW, 8, 'S');
  setColor('#0f172a'); setFont('bold', 8.5);
  doc.text('NET PAYABLE TO FARMER (via DBT)', colX[0] + 3, y + 5.5);
  setColor('#15803d'); setFont('bold', 9);
  doc.text(amount, colX[3] + 3, y + 5.5);
  y += 15;

  // ── Transaction Reference ─────────────────────────────────────────────────
  setFill('#f8fafc');
  doc.roundedRect(margin, y, contentW, 30, 3, 3, 'F');
  setStroke('#e2e8f0');
  doc.setLineWidth(0.2);
  doc.roundedRect(margin, y, contentW, 30, 3, 3, 'S');

  setColor('#0f766e'); setFont('bold', 8);
  doc.text('TRANSACTION REFERENCE', margin + 4, y + 7);

  const txnRows = [
    ['Transaction ID', txnId],
    ['Payment Mode', 'Direct Benefit Transfer (PFMS Gateway)'],
    ['Issued On', new Date().toLocaleString('en-IN')],
    ['Payment Status', status]
  ];
  let ty2 = y + 14;
  txnRows.forEach(([label, val]) => {
    setColor('#64748b'); setFont('normal', 7.5);
    doc.text(label + ':', margin + 4, ty2);
    if (label === 'Payment Status') {
      setColor(status === 'Paid' ? '#15803d' : '#b45309');
      setFont('bold', 7.5);
    } else {
      setColor('#0f172a'); setFont('bold', 7.5);
    }
    doc.text(String(val), margin + 48, ty2);
    ty2 += 5.5;
  });

  // Status badge on right
  const sbW = 38, sbH = 18;
  const sbX = W - margin - sbW - 4;
  const sbY = y + 6;
  const sbColor = status === 'Paid' ? '#15803d' : status === 'Processing' ? '#b45309' : '#64748b';
  setFill(sbColor);
  doc.roundedRect(sbX, sbY, sbW, sbH, 3, 3, 'F');
  setColor('#ffffff');
  setFont('bold', 7);
  doc.text(status === 'Paid' ? '✓ PAID' : status.toUpperCase(), sbX + sbW / 2, sbY + 7, { align: 'center' });
  setFont('normal', 6);
  doc.text('Payment Status', sbX + sbW / 2, sbY + 13, { align: 'center' });

  y += 38;

  // ── Legal Notice ──────────────────────────────────────────────────────────
  setFill('#fefce8');
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'F');
  setStroke('#fde68a');
  doc.roundedRect(margin, y, contentW, 20, 2, 2, 'S');
  setColor('#92400e'); setFont('bold', 7);
  doc.text('LEGAL NOTICE:', margin + 4, y + 6);
  setColor('#78350f'); setFont('normal', 6.5);
  const legalText = 'This receipt is issued under the National Food Security Act / PM-AASHA procurement framework. ' +
    'Payment is processed via PFMS and credited to the registered bank account via DBT. ' +
    'This document is valid as official proof of procurement and payment. For disputes, contact: 1800-180-1551.';
  const splitLegal = doc.splitTextToSize(legalText, contentW - 10);
  doc.text(splitLegal, margin + 4, y + 12);
  y += 27;

  // ── Footer Bar ─────────────────────────────────────────────────────────────
  setFill('#0f172a');
  doc.rect(0, 282, W, 15, 'F');
  setColor('#94a3b8'); setFont('normal', 6.5);
  doc.text('KisanSetu — Digital Agricultural Procurement Portal  •  kisansetu.gov.in  •  Helpline: 1800-180-1551', W / 2, 287, { align: 'center' });
  setColor('#64748b');
  doc.text(`Generated: ${new Date().toLocaleString('en-IN')}  •  Procurement ID: ${prcId}`, W / 2, 292, { align: 'center' });

  // ── Diagonal WATERMARK ────────────────────────────────────────────────────
  doc.saveGraphicsState();
  doc.setGState(new doc.GState({ opacity: 0.04 }));
  setColor('#0f766e');
  setFont('bold', 48);
  doc.text('KisanSetu', W / 2, 160, { align: 'center', angle: 45 });
  doc.restoreGraphicsState();

  // ── Save PDF ───────────────────────────────────────────────────────────────
  const fileName = `KisanSetu_Receipt_${prcId}_${date.replace(/\s/g, '_')}.pdf`;
  doc.save(fileName);
  showToast(`✅ Receipt downloaded: ${fileName}`);
}
