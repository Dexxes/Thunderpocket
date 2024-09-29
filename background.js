// background.js

var pocWindow = null;
var tagDialogWindow = null;

var PocketSaverPlugin =
{
  CONSUMER_KEY: '112093-c1a2ce6cc369a10aa6625f1', // Replace with your Pocket API consumer key
  REDIRECT_URI: 'https://getpocket.com/de/home', // This should match your registered redirect URI
  accessToken: null,  

  init: function () {
    browser.menus.create({
      id: "save-to-pocket",
      title: "In Pocket speichern",
      contexts: ["link"]
    });

    browser.menus.create({
      id: "save-to-pocket-with-tags",
      title: "In Pocket speichern mit Tags",
      contexts: ["link"]
    });

    browser.menus.onClicked.addListener(async(info, tab) => {
      const permissionsToRequest = { permissions: ["webRequest"], origins: ["https://getpocket.com/*"] };
        await browser.permissions.request(permissionsToRequest).then( async(result) => 
        {
          if(result)
          {
            if (info.menuItemId === "save-to-pocket")
              this.saveToPocket(info.linkUrl);              
            else if (info.menuItemId === "save-to-pocket-with-tags")
              this.saveToPocketWithTags(info.linkUrl);            
          }
          else
            this.showNotification("Fehler", "Ohne die Berechtigung funktioniert das Add-On leider nicht");
        });
      
    });

    browser.runtime.onMessage.addListener(this.handleMessage.bind(this));

    this.loadAccessToken();
  },

  loadAccessToken: async function () {
    let result = await browser.storage.local.get('pocketAccessToken');
    this.accessToken = result.pocketAccessToken;
  },

  saveAccessToken: async function (token) {
    await browser.storage.local.set({ pocketAccessToken: token });
    this.accessToken = token;
  },

  saveToPocket: async function (link) {
    await this.loadAccessToken();

    if (!link) {
      this.showNotification("Fehler", "Kein Link ausgewählt");
      return;
    }
    
    if (typeof this.accessToken === 'undefined')
    {
      await this.authenticate(link);
    }
    else {
      try {
        await this.addToPocket(link);
        this.showNotification("Erfolg", "Link in Pocket gespeichert");
      }
      catch (error) {
        console.error("Fehler beim Speichern in Pocket:", error);
        this.showNotification("Fehler", "Fehler beim Speichern in Pocket");
      }
    }
  },

  saveToPocketWithTags: async function (link) 
  {
    await this.loadAccessToken();
    if (!link) 
    {
      this.showNotification("Fehler", "Kein Link ausgewählt");
      return;
    }

    if (typeof this.accessToken === 'undefined')
      this.authenticate(link, true);
    else 
    {
      // Fetch user's tags before opening the dialog
      const tags = await this.getUserTags();

      // Open dialog to input tags
      tagDialogWindow = await browser.windows.create({
        url: "tag_dialog.html",
        type: "popup",
        width: 400,
        height: 220
      });

      // Store the link and tags temporarily
      await browser.storage.local.set({ tempLink: link, userTags: tags });
    }
  },

  getUserTags: async function () {
    try {
      let response = await fetch('https://getpocket.com/v3/get', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Accept': 'application/json'
        },
        body: JSON.stringify({
          consumer_key: this.CONSUMER_KEY,
          access_token: this.accessToken,
          detailType: "complete"
        })
      });

      if (!response.ok) {
        throw new Error('Fehler beim Abrufen der Tags von Pocket');
      }

      var data = await response.json();
      let tags = new Set();

      // Extract unique tags from the response
      Object.values(data.list).forEach(
        item => {
          if (item.tags) {
            Object.keys(item.tags).forEach(tag => tags.add(tag));
          }
        }
      );

      /*Array.from(data.list).forEach(
        item => {
          if (item.tags) {
            Object.keys(item.tags).forEach(tag => tags.add(tag));
          }
        });*/

        return tags;
      //return Array.from(tags);
    } catch (error) {
      console.error("Fehler beim Abrufen der Tags:", error);
      return [];
    }
  },

  handleMessage: async function (message) {
    if (message.action === "saveToPocketWithTags") {
      let { tempLink } = await browser.storage.local.get('tempLink');
      let tags = message.tags;

      try {
        await this.addToPocketWithTags(tempLink, tags);
        this.showNotification("Erfolg", "Link mit Tags in Pocket gespeichert");
      } catch (error) {
        console.error("Fehler beim Speichern in Pocket:", error);
        this.showNotification("Fehler", "Fehler beim Speichern in Pocket");
      }

      // Close the tag dialog window
      if (tagDialogWindow) {
        await browser.windows.remove(tagDialogWindow.id);
        tagDialogWindow = null;
      }

      // Clear the temporary data
      await browser.storage.local.remove(['tempLink', 'userTags']);
    }
  },

  addToPocketWithTags: async function (url, tags) {
    let response = await fetch('https://getpocket.com/v3/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Accept': 'application/json'
      },
      body: JSON.stringify({
        url: url,
        consumer_key: this.CONSUMER_KEY,
        access_token: this.accessToken,
        tags: tags
      })
    });

    if (!response.ok) {
      throw new Error('Fehler beim Speichern in Pocket!');
    }
  },

  authenticate: async function (link = null, withTags = false) {
    try 
    {
      // Step 1: Obtain a request token
      let response = await fetch('https://getpocket.com/v3/oauth/request', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=UTF-8',
          'X-Accept': 'application/json'
        },
        body: JSON.stringify({
          consumer_key: this.CONSUMER_KEY,
          redirect_uri: this.REDIRECT_URI
        })
      });

      let data = await response.json();
      let requestToken = data.code;

      // Store the request token for later use
      await browser.storage.local.set({ pocketRequestToken: requestToken });

      // Step 2: Redirect user to authorization page
      let authUrl = `https://getpocket.com/auth/authorize?request_token=${requestToken}&redirect_uri=${encodeURIComponent(this.REDIRECT_URI)}`;
      pocWindow = await browser.windows.create({ url: authUrl, type: "popup" });

      // Add listener for window updates
      browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
        if (changeInfo.status === 'complete') {
          browser.tabs.get(tabId).then(tab => {
            if (tab.url && tab.url.startsWith(this.REDIRECT_URI))
              this.handleRedirect(tab.url, pocWindow, withTags);
          });
        }
      });
    }
    catch (error) {
      console.error("Authentifizierungsfehler:", error);
      this.showNotification("Fehler", "Fehler beim Authentifizieren bei Pocket");
    }
  },

  handleRedirect: async function (link, pocWindow, withTags) {
    // Close the auth window
    browser.windows.remove(pocWindow.id);

    // Retrieve the request token
    let { pocketRequestToken } = await browser.storage.local.get('pocketRequestToken');

    if (pocketRequestToken) {
      try {
        // Step 3: Convert request token to access token
        let response = await fetch('https://getpocket.com/v3/oauth/authorize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Accept': 'application/json'
          },
          body: JSON.stringify({
            consumer_key: this.CONSUMER_KEY,
            code: pocketRequestToken
          })
        });

        let data = await response.json();
        await this.saveAccessToken(data.access_token);
        this.showNotification("Erfolg", "Erfolgreich bei Pocket eingeloggt");

        // Clear the request token
        await browser.storage.local.remove('pocketRequestToken');
        if (withTags)
          await this.saveToPocketWithTags(link);
        else
          await this.saveToPocket(link);
      }
      catch (error) {
        console.error("Error obtaining access token:", error);
        this.showNotification("Fehler", "Authentifizierungsvorgang bei Pocket gescheitert!");
      }
    }

    // Prevent the redirect
    return { cancel: true };
  },

  addToPocket: async function (url) 
  {
    let response = await fetch('https://getpocket.com/v3/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Accept': 'application/json'        
      },
      body: JSON.stringify({
        url: url,
        consumer_key: this.CONSUMER_KEY,
        access_token: this.accessToken
      })
    });


    if (!response.ok) {
      throw new Error('Fehler beim Speichern in Pocket!');
    }
  },

  showNotification: function (title, message) {
    browser.notifications.create({
      type: "basic",
      iconUrl: "icon.ico",
      title: title,
      message: message
    });
  }
};

PocketSaverPlugin.init();