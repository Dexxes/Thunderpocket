// tag_dialog.js

const tagInput = document.getElementById('tagInput');
const chipsContainer = document.getElementById('chips');

tagInput.addEventListener('keypress', function (e) 
{
    if (e.key === ',' || e.key === 'Enter') 
    {
        e.preventDefault();
        const tag = tagInput.value.trim();
        if (tag) 
        {
            addChip(tag);
            tagInput.value = '';
        }
    }
});

function sanitizeHTML(input) {
    const div = document.createElement('div');
    div.textContent = input;
    return div.innerHTML;
}

function addChip(tag) 
{
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = sanitizeHTML(tag) + ' <span class="close-btn">&times;</span>';
    chip.querySelector('.close-btn').addEventListener('click', function () { chipsContainer.removeChild(chip); });
    chipsContainer.appendChild(chip);
}

document.addEventListener('DOMContentLoaded', async function() {
    // Load user tags
    let { userTags } = await browser.storage.local.get('userTags');
    
    if (userTags && userTags.size > 0) 
    {
        const datalist = document.getElementById('tagSuggestions');
        userTags.forEach(tag => 
        {
            const option = document.createElement('option');
            option.value = tag;
            datalist.appendChild(option);
        });
    }

    document.getElementById('saveButton').addEventListener('click', function() 
    {
        var chips = document.getElementById("chips").children;

        var tags = [];
        Array.from(chips).forEach( (elem) => 
        {
            tags.push(elem.childNodes[0].nodeValue);
        });
        browser.runtime.sendMessage({ action: "saveToPocketWithTags", tags: tags });
        window.close();
    });
});