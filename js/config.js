/*
 * Dorm Points: site settings.
 * You can edit this file right on GitHub (open it and click the pencil icon).
 */
window.DORM_CONFIG = {
  siteTitle: 'Dorm Points',
  subtitle: 'Social Contribution Leaderboard',

  // "Ask for points" requests are emailed here through FormSubmit.co (free, no account).
  // The very first request sends you an activation email: click the link in it once.
  // That email also gives you a random code; put the code here instead of your
  // address if you don't want the address visible in the page source.
  requestEmail: '2024m735@kuas.ac.jp',

  // Students' university email, used to pre-fill the reply address on the request form.
  // {id} becomes the student ID in lowercase. Set to '' to turn this off.
  studentEmailPattern: '{id}@kuas.ac.jp',

  // Where the admin page publishes new points.
  github: {
    owner: 'FunnyKoalaBear',
    repo: 'DormSocialContributionTracker',
    branch: '', // empty = the branch GitHub Pages serves from (found automatically)
    path: 'data/points.json',
  },

  // "How to earn points" section. Also used for the request form's activity list.
  earn: [
    { icon: '🎉', title: 'Dorm Event', points: '+6', text: 'Show up to dorm events.' },
    { icon: '🧽', title: 'Cleaning Day', points: '+8', text: 'Join the dorm cleaning day.' },
    { icon: '🗣️', title: 'Meeting', points: '+4', text: 'Attend dorm meetings.' },
    { icon: '🎈', title: 'Small Event', points: '+3', text: 'Drop by smaller events.' },
    { icon: '💡', title: 'Dorm Initiative', points: '+2 to +8', text: 'Do something good without being asked: clean a messy kitchen, bring trash back from an outing, win a dorm competition…' },
    { icon: '✨', title: 'Something else', points: '±', text: 'Anything else that makes the dorm a better place. The admin decides the points.' },
  ],
  lose: [
    { icon: '🚫', title: 'Rule Violation', points: '−5', text: 'Breaking dorm rules.' },
    { icon: '🧺', title: 'Shared Facility Misuse', points: '−3', text: 'Leaving shared spaces (kitchen, laundry, bathrooms) in a bad state.' },
    { icon: '🤫', title: 'Quiet Hours Noise', points: '−3', text: 'Making noise during quiet hours.' },
  ],
  whyItMatters: [
    { icon: '✉️', text: 'Recommendation letters' },
    { icon: '💼', text: 'Job recommendations' },
    { icon: '🏠', text: 'Who gets to stay in the dorm next year' },
  ],
};
