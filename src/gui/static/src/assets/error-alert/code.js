var lang = navigator.language || navigator.userLanguage;
var telegramLink1 = '<a href="https://web.telegram.org/#/im?p=@skycoinsupport" target="_blank" rel="noreferrer nofollow noopener">';
var telegramLink2 = '</a>';

// Send ?2 at the end of the URL to show error number 2.
if (window.location.toString().indexOf('?2') !== -1) {
  // It is possible to add more languages in the future.
  if (lang.substr(0, 2).toLowerCase == 'en' || true) {
    document.getElementById('title').innerHTML = 'Error #2';
    document.getElementById('text').innerHTML = 'It was not possible to complete initial setup procedure. Please restart the app and/or seek help on our ' + telegramLink1 + 'Telegram.' + telegramLink2;
  }
} else if (window.location.toString().indexOf('?3') !== -1) {
  // It is possible to add more languages in the future.
  if (lang.substr(0, 2).toLowerCase == 'en' || true) {
    document.getElementById('title').innerHTML = 'Error #3';
    document.getElementById('text').innerHTML = 'There was a problem saving the changes made to the wallet and the application has been terminated for security reasons. Please close the app and try again.';
  }
} else {
  if (lang.substr(0, 2).toLowerCase == 'en' || true) {
    document.getElementById('title').innerHTML = 'Error #1';
    document.getElementById('text').innerHTML = 'It is not possible to connect to the backend. Please restart the app and/or seek help on our ' + telegramLink1 + 'Telegram.' + telegramLink2;
  }
}
