// Returns a function suitable for add_task which loads startURL, runs
// transitionTask and waits for endURL to load, checking that the URLs were
// loaded in the correct process.
function makeTest(name, startURL, startProcessIsRemote, endURL, endProcessIsRemote, transitionTask) {
  return async function() {
    info("Running test " + name + ", " + transitionTask.name);
    let browser = gBrowser.selectedBrowser;

    // In non-e10s nothing should be remote
    if (!gMultiProcessBrowser) {
      startProcessIsRemote = false;
      endProcessIsRemote = false;
    }

    // Load the initial URL and make sure we are in the right initial process
    info("Loading initial URL");
    BrowserTestUtils.loadURI(browser, startURL);
    await BrowserTestUtils.browserLoaded(browser, false, startURL);

    is(browser.currentURI.spec, startURL, "Shouldn't have been redirected");
    is(browser.isRemoteBrowser, startProcessIsRemote, "Should be displayed in the right process");

    let docLoadedPromise = BrowserTestUtils.browserLoaded(browser, false, endURL);
    let expectSyncChange = await transitionTask(browser, endURL);
    if (expectSyncChange) {
      is(browser.isRemoteBrowser, endProcessIsRemote, "Should have switched to the right process synchronously");
    }
    await docLoadedPromise;

    is(browser.currentURI.spec, endURL, "Should have made it to the final URL");
    is(browser.isRemoteBrowser, endProcessIsRemote, "Should be displayed in the right process");
  };
}

const CHROME_PROCESS = E10SUtils.NOT_REMOTE;
const WEB_CONTENT_PROCESS = E10SUtils.WEB_REMOTE_TYPE;
const PATH = (getRootDirectory(gTestPath) + "test_process_flags_chrome.html").replace("chrome://mochitests", "");

const CHROME = "chrome://mochitests" + PATH;
const CANREMOTE = "chrome://mochitests-any" + PATH;
const MUSTREMOTE = "chrome://mochitests-content" + PATH;

add_task(async function init() {
  gBrowser.selectedTab = BrowserTestUtils.addTab(gBrowser, "about:blank", {forceNotRemote: true});
});

registerCleanupFunction(() => {
  gBrowser.removeCurrentTab();
});

function test_url(url, chromeResult, contentResult) {
  is(E10SUtils.canLoadURIInRemoteType(url, /* fission */ false, CHROME_PROCESS),
     chromeResult, "Check URL in chrome process.");
  is(E10SUtils.canLoadURIInRemoteType(url, /* fission */ false, WEB_CONTENT_PROCESS),
     contentResult, "Check URL in web content process.");

  is(E10SUtils.canLoadURIInRemoteType(url + "#foo", /* fission */ false, CHROME_PROCESS),
     chromeResult, "Check URL with ref in chrome process.");
  is(E10SUtils.canLoadURIInRemoteType(url + "#foo", /* fission */ false, WEB_CONTENT_PROCESS),
     contentResult, "Check URL with ref in web content process.");

  is(E10SUtils.canLoadURIInRemoteType(url + "?foo", /* fission */ false, CHROME_PROCESS),
     chromeResult, "Check URL with query in chrome process.");
  is(E10SUtils.canLoadURIInRemoteType(url + "?foo", /* fission */ false, WEB_CONTENT_PROCESS),
     contentResult, "Check URL with query in web content process.");

  is(E10SUtils.canLoadURIInRemoteType(url + "?foo#bar", /* fission */ false, CHROME_PROCESS),
     chromeResult, "Check URL with query and ref in chrome process.");
  is(E10SUtils.canLoadURIInRemoteType(url + "?foo#bar", /* fission */ false, WEB_CONTENT_PROCESS),
     contentResult, "Check URL with query and ref in web content process.");
}

add_task(async function test_chrome() {
  test_url(CHROME, true, false);
});

add_task(async function test_any() {
  test_url(CANREMOTE, true, true);
});

add_task(async function test_remote() {
  test_url(MUSTREMOTE, false, true);
});

// The set of page transitions
var TESTS = [
  [
    "chrome -> chrome",
    CHROME, false,
    CHROME, false,
  ],
  [
    "chrome -> canremote",
    CHROME, false,
    CANREMOTE, false,
  ],
  [
    "chrome -> mustremote",
    CHROME, false,
    MUSTREMOTE, true,
  ],
  [
    "remote -> chrome",
    MUSTREMOTE, true,
    CHROME, false,
  ],
  [
    "remote -> canremote",
    MUSTREMOTE, true,
    CANREMOTE, true,
  ],
  [
    "remote -> mustremote",
    MUSTREMOTE, true,
    MUSTREMOTE, true,
  ],
];

// The different ways to transition from one page to another
var TRANSITIONS = [
// Loads the new page by calling browser.loadURI directly
async function loadURI(browser, uri) {
  info("Calling browser.loadURI");
  await BrowserTestUtils.loadURI(browser, uri);
  return true;
},

// Loads the new page by finding a link with the right href in the document and
// clicking it
function clickLink(browser, uri) {
  info("Clicking link");

  ContentTask.spawn(browser, uri, function frame_script(frameUri) {
    let link = content.document.querySelector("a[href='" + frameUri + "']");
    link.click();
  });

  return false;
},
];

// Creates a set of test tasks, one for each combination of TESTS and TRANSITIONS.
for (let test of TESTS) {
  for (let transition of TRANSITIONS) {
    add_task(makeTest(...test, transition));
  }
}
