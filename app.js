'use strict';

// Fill these in before the study goes live.
const CONFIG = {
  // Google Apps Script web app URL (see apps-script.gs). Leave empty while
  // testing: the data is then downloaded as a JSON file instead of sent.
  submitUrl: 'https://script.google.com/macros/s/AKfycby6_8GSxieZsjImhYVEg56OjPjrN4TQIObkmkq1-K4LNxhMiO1GSdNMVqdnKbbuZN8/exec',

  // Shows the test bar (group switch and reset). Set to false before launch.
  debug: true
};

const DATA_VERSION = '2.0';
const MIN_AGE = 18;

const store = {
  get(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  },
  remove(key) {
    try { localStorage.removeItem(key); } catch (e) { /* private mode */ }
  }
};

const $ = (id) => document.getElementById(id);

const session = {
  group: null,
  code: null,
  startedAt: 0,
  detailsShownAt: 0,
  detailsSeconds: 0,
  termsOpened: 0,
  termsOpenedAt: 0,
  termsSeconds: 0,
  termsKept: 1,
  pii: {},
  fillers: {},
  habits: {},
  followup: {},
  network: null
};


// ---------- Question content ----------

const yesNo = [['yes', 'Yes'], ['no', 'No']];

const birthYears = (() => {
  const newest = new Date().getFullYear() - MIN_AGE;
  const years = [];
  for (let y = newest; y >= 1940; y--) years.push([String(y), String(y)]);
  return years;
})();

// Labels are identical in both groups. Only the hint (the stated reason for
// asking) differs: a security reason in A, a research reason in B.
const DETAIL_QUESTIONS = [
  {
    id: 'pwm', type: 'choice', options: yesNo,
    label: 'Do you currently use a dedicated password manager (e.g., LastPass, Bitwarden)?'
  },
  {
    id: 'os', type: 'select',
    options: [['windows', 'Windows'], ['macos', 'macOS'], ['linux', 'Linux'], ['ios', 'iOS'], ['android', 'Android']],
    label: 'Which operating system is installed on your primary device?'
  },
  {
    id: 'pet', type: 'text', pii: true,
    label: 'Enter the name of your first pet.',
    hint: {
      A: 'Checked against lists of commonly breached passwords and security answers.',
      B: 'Used to describe the childhood household background of participants.'
    }
  },
  {
    id: 'tfa', type: 'choice', options: yesNo,
    label: 'Do you have two-factor authentication (2FA) enabled on your primary email?'
  },
  {
    id: 'school', type: 'text', pii: true,
    label: 'Enter the name of the high school you graduated from.',
    hint: {
      A: 'Checked against leaked records from schools and education platforms.',
      B: 'Used to describe the educational background of the sample.'
    }
  },
  {
    id: 'wifi', type: 'choice',
    options: [['daily', 'Daily'], ['weekly', 'Weekly'], ['rarely', 'Rarely'], ['never', 'Never']],
    label: 'How often do you connect to unsecured public Wi-Fi networks?'
  },
  {
    id: 'email', type: 'text', pii: true, inputmode: 'email',
    label: 'Enter your primary personal or academic email address.',
    hint: {
      A: 'Queried against indexed breach databases.',
      B: 'Used to describe which email providers participants use.'
    }
  },
  {
    id: 'vpn', type: 'choice', options: yesNo,
    label: 'Do you actively route your traffic through a VPN?'
  },
  {
    id: 'street', type: 'text', pii: true,
    label: 'Enter the name of the street you grew up on.',
    hint: {
      A: 'Checked against data broker listings of past addresses.',
      B: 'Used to describe whether participants grew up in urban or rural areas.'
    }
  },
  {
    id: 'phishing', type: 'choice',
    options: [['0-5', '0 to 5'], ['6-20', '6 to 20'], ['20+', 'More than 20']],
    label: 'How many phishing or spam emails do you estimate you receive each week?'
  },
  {
    id: 'birthyear', type: 'select', pii: true, options: birthYears,
    label: 'Select your birth year.',
    hint: {
      A: 'Narrows the search to age-specific breach records.',
      B: 'Used to describe the age range of the sample.'
    }
  },
  {
    id: 'notified', type: 'choice', options: yesNo,
    label: 'Have you ever been notified that your data was part of a company data breach?'
  }
];

const PII_IDS = DETAIL_QUESTIONS.filter(q => q.pii).map(q => q.id);

const AGREE = ['Strongly disagree', 'Strongly agree'];

// Pre-reveal ratings. Same items and order in both groups.
const HABIT_ITEMS = [
  { id: 'concern_1', ends: AGREE, text: 'Compared to other things on my mind, my privacy online is very important to me.' },
  { id: 'concern_2', ends: AGREE, text: 'I am concerned that online companies collect personal information about me without my knowledge.' },
  { id: 'trust', ends: AGREE, text: 'I generally trust popular websites to handle my personal data responsibly.' },
  { id: 'efficacy', ends: AGREE, text: 'I know what steps to take to protect my personal data online.' },
  { id: 'concern_3', ends: AGREE, text: 'It usually bothers me when websites ask me for personal information.' },
  { id: 'attention', ends: AGREE, text: 'To show that you are reading carefully, please select 2 for this statement.' },
  { id: 'behaviour', ends: AGREE, text: 'I regularly take steps to protect my personal data online.' },
  { id: 'concern_4', ends: AGREE, text: 'I feel anxious about identity theft or data breaches during my routine online activities.' },
  { id: 'protect_check', ends: AGREE, text: 'I believe this website will keep the information I entered safe.' },
  { id: 'vuln_pre', ends: ['Not vulnerable at all', 'Extremely vulnerable'], text: 'How vulnerable do you feel your routine online behaviour is?' }
];

// Post-reveal. vuln_post repeats vuln_pre word for word (paired comparison).
const FOLLOWUP_ITEMS = [
  { id: 'vuln_post', ends: ['Not vulnerable at all', 'Extremely vulnerable'], text: 'How vulnerable do you feel your routine online behaviour is?' },
  { id: 'surprise', ends: ['Not surprised at all', 'Completely surprised'], text: 'How surprised were you by how much information your browser shared in the background?' },
  { id: 'intent', ends: ['Very unlikely', 'Very likely'], text: 'How likely are you to change your browser privacy settings or use anti-tracking tools after seeing this report?' },
  {
    id: 'truthful', type: 'choice',
    text: 'Were the personal details you typed in earlier your real ones?',
    options: [['all', 'All real'], ['some', 'Some real'], ['none', 'None real'], ['na', 'I left them blank']]
  },
  {
    id: 'suspected', type: 'choice',
    text: 'Before the report, did you suspect what this study was really about?',
    options: [['no', 'No'], ['partly', 'Partly'], ['yes', 'Yes']]
  }
];

const COPY = {
  A: {
    steps: ['Details', 'Habits', 'Report'],
    detailsTitle: 'Exposure scan',
    detailsIntro: 'Add the details you want included in your scan. Every field is optional, and more details give a more complete report.',
    detailsButton: 'Continue',
    habitsTitle: 'Your security habits',
    habitsIntro: 'Your answers help us weight the risks in your report. Rate each statement from 1 (strongly disagree) to 7 (strongly agree).',
    habitsButton: 'Run scan',
    scanningTitle: 'Running your scan',
    scanSteps: ['Checking breach records', 'Comparing security answers', 'Searching data broker listings', 'Building your report'],
    stepDelay: 1400
  },
  B: {
    steps: ['Background', 'Attitudes', 'Finish'],
    detailsTitle: 'Background questions',
    detailsIntro: 'These questions help us describe the people taking part in the study. Every question is optional.',
    detailsButton: 'Continue',
    habitsTitle: 'Attitudes toward online privacy',
    habitsIntro: 'Please rate how much you agree with each statement, from 1 (strongly disagree) to 7 (strongly agree).',
    habitsButton: 'Submit answers',
    scanningTitle: 'Saving your answers',
    scanSteps: ['Saving responses'],
    stepDelay: 900
  }
};

const HALDEN_LOGO = '<svg class="logo-mark" viewBox="0 0 28 28" aria-hidden="true"><path d="M14 2 4 6v7c0 6.4 4.2 11.3 10 13 5.8-1.7 10-6.6 10-13V6L14 2Z" fill="currentColor"/><path d="M9.5 14.2 12.6 17.3 18.8 10.8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>Halden';
const SURVEY_LOGO = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3" width="16" height="18" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>Online Habits Survey';


// ---------- Screens ----------

function show(id) {
  document.querySelectorAll('.screen').forEach(el => { el.hidden = el.id !== id; });
  window.scrollTo(0, 0);
}

function showInApp(sectionId, stepIndex) {
  ['screen-details', 'screen-habits', 'screen-scanning'].forEach(id => { $(id).hidden = id !== sectionId; });
  document.querySelectorAll('#steps li').forEach((li, i) => {
    li.classList.toggle('is-done', i < stepIndex);
    li.classList.toggle('is-current', i === stepIndex);
  });
  show('screen-app');
}

function setTheme(name) {
  document.body.className = 'theme-' + name;
}

let toastTimer;
function toast(message) {
  const el = $('toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2800);
}


// ---------- Rendering ----------

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function renderDetails(group) {
  const html = DETAIL_QUESTIONS.map(q => {
    const hint = q.hint ? `<span class="q-hint" id="${q.id}-hint">${escapeHtml(q.hint[group])}</span>` : '';
    const described = q.hint ? ` aria-describedby="${q.id}-hint"` : '';

    if (q.type === 'text') {
      // Odd field names keep browser autofill from filling these in for people.
      return `<div class="q">
        <label class="q-label" for="f-${q.id}">${escapeHtml(q.label)}</label>${hint}
        <input type="text" id="f-${q.id}" name="x-${q.id}-${Math.random().toString(36).slice(2, 7)}"
          autocomplete="off" autocapitalize="off" spellcheck="false"${q.inputmode ? ` inputmode="${q.inputmode}"` : ''}${described}>
      </div>`;
    }

    if (q.type === 'select') {
      const opts = q.options.map(([v, l]) => `<option value="${v}">${escapeHtml(l)}</option>`).join('');
      return `<div class="q">
        <label class="q-label" for="f-${q.id}">${escapeHtml(q.label)}</label>${hint}
        <select id="f-${q.id}" autocomplete="off"${described}><option value="">Select</option>${opts}</select>
      </div>`;
    }

    return `<fieldset class="q choice-field"><legend class="q-label">${escapeHtml(q.label)}</legend>
      <div class="choice-group">${choiceButtons(q.id, q.options)}</div></fieldset>`;
  }).join('');

  $('details-form').innerHTML = html;
}

function choiceButtons(id, options) {
  return options.map(([v, l]) =>
    `<label class="choice"><input type="radio" name="${id}" value="${v}"><span>${escapeHtml(l)}</span></label>`
  ).join('');
}

function renderLikert(formId, items) {
  $(formId).innerHTML = items.map(item => {
    if (item.type === 'choice') {
      return `<fieldset class="likert"><legend>${escapeHtml(item.text)}</legend>
        <div class="choice-group">${choiceButtons(item.id, item.options)}</div></fieldset>`;
    }
    const points = [1, 2, 3, 4, 5, 6, 7].map(n =>
      `<label><input type="radio" name="${item.id}" value="${n}" aria-label="${n}"><span>${n}</span></label>`
    ).join('');
    return `<fieldset class="likert">
      <legend>${escapeHtml(item.text)}</legend>
      <div class="scale">${points}</div>
      <div class="scale-ends"><span>1 = ${escapeHtml(item.ends[0])}</span><span>7 = ${escapeHtml(item.ends[1])}</span></div>
    </fieldset>`;
  }).join('');
}

// Lets people un-select a choice by clicking it again, so nothing is forced.
function allowDeselect(form) {
  form.addEventListener('pointerdown', e => {
    const input = e.target.closest('label')?.querySelector('input[type="radio"]');
    if (input) input.dataset.wasChecked = input.checked ? '1' : '';
  });
  form.addEventListener('click', e => {
    const input = e.target.closest('label')?.querySelector('input[type="radio"]');
    if (!input || e.target !== input) return;
    if (input.dataset.wasChecked === '1') input.checked = false;
    input.dataset.wasChecked = '';
  });
}

function radioValue(name) {
  const checked = document.querySelector(`input[name="${name}"]:checked`);
  return checked ? checked.value : '';
}


// ---------- Disclosure coding ----------

// 0 = left blank, 1 = plausible answer, 2 = filler or keyboard mash,
// 3 = says it does not apply (e.g. "never had a pet").
const NOT_APPLICABLE = /^(none|no|nope|n\/?a|never|nothing|no pet|no pets|never had( one| a pet)?|didn'?t have( one| a pet)?|did not have( one| a pet)?|not applicable|nu|niciunul|nu am( avut)?)$/i;
const PLACEHOLDER = /^(test|testing|asdf\w*|qwer\w*|zxcv\w*|hjkl|jkl;?|abc|abcd|xxx+|aaa+|foo|bar|blah|idk|dunno|prefer not( to say)?|-+|\.+|\?+|x)$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

function codeAnswer(id, raw) {
  const value = (raw || '').trim();
  if (!value) return 0;
  if (id === 'birthyear') return 1;
  if (NOT_APPLICABLE.test(value)) return 3;
  if (PLACEHOLDER.test(value)) return 2;
  if (/^(.)\1+$/.test(value.replace(/\s/g, ''))) return 2;

  if (id === 'email') return EMAIL.test(value) ? 1 : 2;

  if (!/\p{L}/u.test(value)) return 2;
  const letters = value.replace(/[^\p{L}]/gu, '');
  if (letters.length >= 5 && !/[aeiouyăâîäöüéèàíóúå]/i.test(letters)) return 2;
  if (letters.length < 2) return 2;
  return 1;
}


// ---------- Device and network details ----------

function startNetworkLookup() {
  const withTimeout = (url, ms) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    return fetch(url, { signal: ctrl.signal, cache: 'no-store' })
      .then(r => { clearTimeout(timer); if (!r.ok) throw new Error(r.status); return r.json(); });
  };

  session.network = withTimeout('https://ipapi.co/json/', 6000)
    .then(d => {
      if (!d.ip) throw new Error('no ip');
      const place = [d.city, d.region, d.country_name].filter(Boolean).join(', ');
      return { ip: d.ip, place, org: d.org || '' };
    })
    .catch(() => withTimeout('https://api.ipify.org?format=json', 5000)
      .then(d => ({ ip: d.ip, place: '', org: '' })))
    .catch(() => null);
}

function describeBrowser() {
  const ua = navigator.userAgent;
  let browser = 'Unknown browser';
  let m;
  if ((m = ua.match(/Edg\/(\d+)/))) browser = 'Microsoft Edge ' + m[1];
  else if ((m = ua.match(/OPR\/(\d+)/))) browser = 'Opera ' + m[1];
  else if ((m = ua.match(/Firefox\/(\d+)/))) browser = 'Firefox ' + m[1];
  else if ((m = ua.match(/(?:Chrome|CriOS)\/(\d+)/))) browser = 'Chrome ' + m[1];
  else if ((m = ua.match(/Version\/(\d+).*Safari/))) browser = 'Safari ' + m[1];

  let os = 'Unknown system';
  if (/Windows NT 10/.test(ua)) os = 'Windows 10 or 11';
  else if (/Windows/.test(ua)) os = 'Windows';
  else if ((m = ua.match(/Android (\d+)/))) os = 'Android ' + m[1];
  else if ((m = ua.match(/(?:iPhone|iPad).*OS (\d+)/))) os = (/iPad/.test(ua) ? 'iPadOS ' : 'iOS ') + m[1];
  else if (/Mac OS X/.test(ua)) os = navigator.maxTouchPoints > 1 ? 'iPadOS' : 'macOS';
  else if (/CrOS/.test(ua)) os = 'ChromeOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os + ', ' + browser;
}

function graphicsCard() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    if (!gl) return null;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || null;
  } catch (e) {
    return null;
  }
}

function deviceDetails() {
  const s = window.screen;
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const offset = -new Date().getTimezoneOffset() / 60;
  const langs = (navigator.languages && navigator.languages.length ? navigator.languages : [navigator.language]).join(', ');

  const hardware = [];
  if (navigator.hardwareConcurrency) {
    const cores = navigator.hardwareConcurrency;
    hardware.push(cores + (cores === 1 ? ' processor core' : ' processor cores'));
  }
  if (navigator.deviceMemory) hardware.push('about ' + navigator.deviceMemory + ' GB memory');

  return [
    ['System and browser', describeBrowser()],
    ['Screen', `${s.width} \u00d7 ${s.height} px, pixel ratio ${window.devicePixelRatio || 1}`],
    ['Hardware', hardware.join(', ') || null],
    ['Graphics', graphicsCard()],
    ['Time zone', `${tz} (UTC${offset >= 0 ? '+' : ''}${offset})`],
    ['Languages', langs],
    ['Touch screen', navigator.maxTouchPoints > 0 ? 'Yes' : 'No']
  ];
}

function deviceClass() {
  return window.matchMedia('(pointer: coarse)').matches && Math.min(screen.width, screen.height) < 820
    ? 'mobile' : 'desktop';
}


// ---------- Flow ----------

function init() {
  if (CONFIG.debug) setupDebugBar();

  if (store.get('pp_done') === '1' && !CONFIG.debug) {
    show('screen-repeat');
    return;
  }

  $('consent-btn').addEventListener('click', startStudy);
  $('start-scan').addEventListener('click', () => openDetails());
  document.querySelectorAll('[data-nolink]').forEach(a => a.addEventListener('click', e => {
    e.preventDefault();
    toast(a.classList.contains('logo') ? 'You are already on the home page.' : 'Available after your first scan.');
  }));

  $('terms-toggle').addEventListener('click', toggleTerms);
  $('terms-checkbox').addEventListener('change', e => { session.termsKept = e.target.checked ? 1 : 0; });
  $('details-next').addEventListener('click', submitDetails);
  $('habits-next').addEventListener('click', submitHabits);
  $('report-next').addEventListener('click', () => show('screen-followup'));
  $('followup-next').addEventListener('click', submitFollowup);
  $('final-yes').addEventListener('click', () => finish(true));
  $('final-no').addEventListener('click', () => finish(false));

  ['details-form', 'habits-form', 'followup-form'].forEach(id => {
    $(id).addEventListener('submit', e => e.preventDefault());
  });
  // Only the personal-detail questions are optional, so only they can be un-selected.
  allowDeselect($('details-form'));
  ['habits-form', 'followup-form'].forEach(id => {
    $(id).addEventListener('change', e => {
      e.target.closest('.likert')?.classList.remove('is-missing');
    });
  });
}

function assignGroup() {
  let group = store.get('pp_group');
  if (group !== 'A' && group !== 'B') {
    group = Math.random() < 0.5 ? 'A' : 'B';
    store.set('pp_group', group);
  }
  return group;
}

function startStudy() {
  session.group = assignGroup();
  session.startedAt = Date.now();
  session.code = participantCode();
  updateDebugBar();

  // The IP lookup only starts after consent.
  startNetworkLookup();

  const group = session.group;
  const copy = COPY[group];

  $('app-brand').innerHTML = group === 'A' ? HALDEN_LOGO : SURVEY_LOGO;
  document.querySelectorAll('#steps li').forEach((li, i) => { li.textContent = copy.steps[i]; });
  $('details-title').textContent = copy.detailsTitle;
  $('details-intro').textContent = copy.detailsIntro;
  $('details-next').textContent = copy.detailsButton;
  $('habits-title').textContent = copy.habitsTitle;
  $('habits-intro').textContent = copy.habitsIntro;
  $('habits-next').textContent = copy.habitsButton;
  $('scanning-title').textContent = copy.scanningTitle;

  $('app-aside').hidden = group !== 'A';
  document.querySelector('.app-body').classList.toggle('has-aside', group === 'A');

  renderDetails(group);
  renderLikert('habits-form', HABIT_ITEMS);
  renderLikert('followup-form', FOLLOWUP_ITEMS);

  if (group === 'A') {
    setTheme('a');
    show('screen-landing');
  } else {
    openDetails();
  }
}

function openDetails() {
  setTheme(session.group === 'A' ? 'a' : 'b');
  session.detailsShownAt = Date.now();
  showInApp('screen-details', 0);
}

function toggleTerms(e) {
  e.preventDefault();
  const box = $('terms-text');
  if (box.hidden) {
    box.hidden = false;
    session.termsOpened = 1;
    session.termsOpenedAt = Date.now();
    e.target.textContent = 'Hide terms';
  } else {
    box.hidden = true;
    session.termsSeconds += (Date.now() - session.termsOpenedAt) / 1000;
    e.target.textContent = 'View terms';
  }
}

function submitDetails() {
  if (!$('terms-text').hidden) {
    session.termsSeconds += (Date.now() - session.termsOpenedAt) / 1000;
    session.termsOpenedAt = Date.now();
  }
  session.detailsSeconds = Math.round((Date.now() - session.detailsShownAt) / 1000);

  DETAIL_QUESTIONS.forEach(q => {
    if (q.pii) {
      const raw = $('f-' + q.id).value;
      session.pii[q.id] = { raw, code: codeAnswer(q.id, raw) };
    } else if (q.type === 'select') {
      session.fillers[q.id] = $('f-' + q.id).value;
    } else {
      session.fillers[q.id] = radioValue(q.id);
    }
  });

  showInApp('screen-habits', 1);
}

function collectRatings(items, target) {
  items.forEach(item => { target[item.id] = radioValue(item.id); });
  return items.filter(item => !target[item.id]);
}

// Rating questions are required: the page will not move on until every item
// has an answer. Unanswered items are highlighted and the first one is scrolled into view.
function requireAll(formId, missing, warningId) {
  const warning = $(warningId);
  const form = $(formId);
  form.querySelectorAll('.likert').forEach(el => el.classList.remove('is-missing'));

  if (!missing.length) {
    warning.hidden = true;
    return true;
  }

  missing.forEach(item => {
    form.querySelector(`input[name="${item.id}"]`).closest('.likert').classList.add('is-missing');
  });
  warning.textContent = missing.length === 1
    ? 'Please answer the highlighted question to continue.'
    : `Please answer the ${missing.length} highlighted questions to continue.`;
  warning.hidden = false;

  const first = form.querySelector('.likert.is-missing');
  first.scrollIntoView({ behavior: 'smooth', block: 'center' });
  first.querySelector('input').focus({ preventScroll: true });
  return false;
}

function submitHabits() {
  const missing = collectRatings(HABIT_ITEMS, session.habits);
  if (!requireAll('habits-form', missing, 'habits-warning')) return;
  runScanAnimation();
}

function runScanAnimation() {
  const copy = COPY[session.group];
  const list = $('scan-steps');
  list.innerHTML = copy.scanSteps.map(t => `<li><span class="ind"></span>${escapeHtml(t)}</li>`).join('');
  showInApp('screen-scanning', 2);

  const items = [...list.children];
  let i = 0;
  const tick = () => {
    if (i > 0) { items[i - 1].classList.remove('is-active'); items[i - 1].classList.add('is-done'); }
    if (i < items.length) {
      items[i].classList.add('is-active');
      i++;
      setTimeout(tick, copy.stepDelay);
    } else {
      setTimeout(showReport, 500);
    }
  };
  tick();
}

async function showReport() {
  const group = session.group;
  const network = await Promise.race([session.network, new Promise(r => setTimeout(() => r(null), 3000))]);

  $('report-title').textContent = group === 'A' ? 'This was not a real scan' : 'This was not only a background survey';
  $('report-lede').textContent = group === 'A'
    ? 'Halden does not exist. No breach database was searched and nothing you entered left your browser. You took part in a psychology study about how people share personal information online. This page shows what you shared, and why it matters.'
    : 'The background questions were part of a psychology study about how people share personal information online. Nothing you typed left your browser. This page shows what you shared, and why it matters.';

  const labels = { pet: 'First pet', school: 'High school', email: 'Email address', street: 'Childhood street', birthyear: 'Birth year' };
  $('report-active').innerHTML = PII_IDS.map(id => {
    const { raw, code } = session.pii[id];
    if (code === 0) return row(labels[id], 'Not entered', 'is-empty');
    return row(labels[id], raw.trim(), code === 1 ? 'is-shared' : '');
  }).join('');

  const shared = PII_IDS.filter(id => session.pii[id].code === 1).length;
  const summary = $('report-summary');
  summary.classList.toggle('is-calm', shared < 2);
  summary.innerHTML = summaryText(shared);

  const passive = [];
  if (network) {
    passive.push(['IP address', network.ip]);
    if (network.place) passive.push(['Approximate location', network.place]);
    if (network.org) passive.push(['Internet provider', network.org]);
  } else {
    passive.push(['IP address', null]);
  }
  passive.push(...deviceDetails());
  $('report-passive').innerHTML = passive
    .map(([label, value]) => value ? row(label, value, '') : row(label, 'Not available in this browser', 'is-empty'))
    .join('');

  const note = $('report-terms');
  if (session.termsKept) {
    note.textContent = session.termsOpened
      ? 'The terms box on the form was ticked for you, and it stayed ticked. You did open the terms, which said this page would read details like your graphics card and location.'
      : 'The terms box on the form was ticked for you, and it stayed ticked. Those terms, which you did not open, said this page would read details like your graphics card and location.';
    note.hidden = false;
  } else {
    note.textContent = 'The terms box on the form was ticked for you, and you unticked it. The page could still read the details above, because browsers share them with every site.';
    note.hidden = false;
  }

  setTheme('study');
  show('screen-report');
}

function summaryText(shared) {
  if (shared === 0) {
    return '<p><strong>You did not enter any of the personal details.</strong> That is exactly the caution this study was looking for. Your browser still shared the information further down without asking.</p>';
  }
  if (shared === 1) {
    return '<p><strong>You entered 1 of 5 personal details.</strong> On its own that is a small risk. Your browser also shared the information further down without asking.</p>';
  }
  return `<p><strong>You entered ${shared} of 5 personal details.</strong> Together, details like these are enough for someone to answer common security questions or write a convincing phishing message in your name.</p>`;
}

function row(label, value, cls) {
  return `<div><dt>${escapeHtml(label)}</dt><dd class="${cls}">${escapeHtml(value)}</dd></div>`;
}

function submitFollowup() {
  const missing = collectRatings(FOLLOWUP_ITEMS, session.followup);
  if (!requireAll('followup-form', missing, 'followup-warning')) return;

  const group = session.group;
  $('debrief-version').textContent = group === 'A'
    ? 'You saw a website presented as a security scanner ("Halden"). Others saw a plain research survey asking the same questions.'
    : 'You saw a plain research survey. Others saw the same questions on a website presented as a security scanner.';

  const untrue = group === 'A'
    ? [
        'Halden is not a real service. No scan took place and no breach database, data broker or password list was searched.',
        'The example report, the claim that your inputs were hashed, and the explanations next to each question were invented for the study.',
        'The terms and licence agreement were not real. They were included to see whether people open pre-ticked terms.'
      ]
    : [
        'The reasons given next to the personal questions (for example, describing the age range of the sample) were not real. We do not use your answers to those questions at all.',
        'The terms and licence agreement were not real. They were included to see whether people open pre-ticked terms.'
      ];
  $('debrief-untrue').innerHTML = untrue.map(t => `<li>${escapeHtml(t)}</li>`).join('');

  show('screen-debrief');
}

function buildPayload() {
  const n = v => (v === '' || v == null ? '' : Number(v));
  const p = {
    version: DATA_VERSION,
    code: session.code,
    group: session.group,
    device: deviceClass(),
    date: new Date().toISOString().slice(0, 10)
  };

  PII_IDS.forEach(id => { p['pii_' + id] = session.pii[id].code; });
  p.disclosure_score = PII_IDS.filter(id => session.pii[id].code === 1).length;
  p.invalid_count = PII_IDS.filter(id => session.pii[id].code === 2).length;

  Object.keys(session.fillers).forEach(id => { p[id] = session.fillers[id]; });

  HABIT_ITEMS.forEach(item => {
    if (item.id !== 'attention') p[item.id] = n(session.habits[item.id]);
  });
  p.attention_ok = session.habits.attention === '2' ? 1 : 0;

  FOLLOWUP_ITEMS.forEach(item => {
    p[item.id] = item.type === 'choice' ? session.followup[item.id] : n(session.followup[item.id]);
  });

  p.terms_opened = session.termsOpened;
  p.terms_seconds = Math.round(session.termsSeconds);
  p.terms_kept = session.termsKept;
  p.details_seconds = session.detailsSeconds;
  p.total_seconds = Math.round((Date.now() - session.startedAt) / 1000);
  return p;
}

async function finish(consented) {
  $('final-yes').disabled = true;
  $('final-no').disabled = true;

  if (!consented) {
    clearSession();
    store.set('pp_done', '1');
    $('finish-title').textContent = 'Your answers were discarded';
    $('finish-body').innerHTML = '<p>Nothing from this session was sent or stored. Thank you for your time, and we hope the report was useful.</p>';
    show('screen-finish');
    return;
  }

  const payload = buildPayload();

  try {
    if (CONFIG.submitUrl) {
      // Apps Script does not send CORS headers, so the response cannot be read.
      // A network failure still throws and is handled below.
      await fetch(CONFIG.submitUrl, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(payload)
      });
    } else {
      downloadJson(payload);
    }
  } catch (err) {
    $('final-yes').disabled = false;
    $('final-no').disabled = false;
    toast('Your answers could not be sent. Check your connection and try again.');
    return;
  }

  clearSession();
  store.set('pp_done', '1');
  $('finish-title').textContent = 'Thank you for taking part';
  $('finish-body').innerHTML =
    `<p>Your anonymous answers have been saved. You can close this tab now.</p>`;
  show('screen-finish');
}

function downloadJson(payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `participant_${payload.code}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

// Removes everything typed in this session from the page and from memory.
function clearSession() {
  ['details-form', 'habits-form', 'followup-form'].forEach(id => $(id).reset());
  ['report-active', 'report-passive'].forEach(id => { $(id).innerHTML = ''; });
  session.pii = {};
  session.network = null;
  store.remove('pp_group');
}

function participantCode() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const s = [...bytes].map(b => chars[b % chars.length]).join('');
  return s.slice(0, 4) + '-' + s.slice(4);
}


// ---------- Test mode ----------

function setupDebugBar() {
  $('debug-bar').hidden = false;
  updateDebugBar();
  $('debug-switch').addEventListener('click', () => {
    const current = store.get('pp_group') || 'A';
    store.set('pp_group', current === 'A' ? 'B' : 'A');
    store.remove('pp_done');
    location.reload();
  });
  $('debug-reset').addEventListener('click', () => {
    store.remove('pp_group');
    store.remove('pp_done');
    location.reload();
  });
}

function updateDebugBar() {
  if (!CONFIG.debug) return;
  $('debug-group').textContent = session.group || store.get('pp_group') || 'not assigned';
}


document.addEventListener('DOMContentLoaded', init);
