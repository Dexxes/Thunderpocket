document.getElementById('logout').addEventListener('click', async () => {    
    await browser.storage.local.set({ pocketAccessToken: null });
    document.getElementById('logout').setAttribute("disabled", "");
});