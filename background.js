// Service worker for Cookie Editor Pro
// Handles cookie operations that require background context

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getCookies') {
    chrome.cookies.getAll({ url: message.url }, (cookies) => {
      sendResponse({ cookies });
    });
    return true;
  }

  if (message.action === 'setCookie') {
    chrome.cookies.set(message.cookie, (cookie) => {
      sendResponse({ cookie, error: chrome.runtime.lastError?.message });
    });
    return true;
  }

  if (message.action === 'removeCookie') {
    chrome.cookies.remove({
      url: message.url,
      name: message.name,
    }, () => {
      sendResponse({ error: chrome.runtime.lastError?.message });
    });
    return true;
  }

  if (message.action === 'removeAllCookies') {
    chrome.cookies.getAll({ url: message.url }, (cookies) => {
      let removed = 0;
      if (cookies.length === 0) {
        sendResponse({ removed: 0 });
        return;
      }
      for (const cookie of cookies) {
        const protocol = cookie.secure ? 'https:' : 'http:';
        const cookieUrl = `${protocol}//${cookie.domain.replace(/^\./, '')}${cookie.path}`;
        chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
          removed++;
          if (removed === cookies.length) {
            sendResponse({ removed });
          }
        });
      }
    });
    return true;
  }
});
