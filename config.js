// The Maitri company app: what it is made of. Screens only: nothing here is secret. The sign-in Client ID is public by
// design (there is no client secret), and an engine's address answers nobody without a Google ID token of a maitri.in account.
// A new department = one line in `modules` and its file under modules/. ee4e31a · 15 Oct 26 21:35 · app 4891fd5 + speedtest and the engine addresses are written in
// when the site is built (scripts/make-app-site.sh).
window.MAITRI_CONFIG = {
  version: 'ee4e31a · 15 Oct 26 21:35 · app 4891fd5 + speedtest',
  clientId: '450946631995-tvnhp1ug4f1ut5ojombndkg6l11sodt4.apps.googleusercontent.com',
  domain: 'maitri.in',
  modules: [
    { id: 'sy13', src: 'modules/sy13.js', endpoint: 'https://script.google.com/macros/s/AKfycbxjnrj84WoVvwjZeNJGSYNAHGQFInycXj0FS1dSXo3CGOvKSjs2vvtEd3m01_8Huo9Z/exec' }
  ]
};
