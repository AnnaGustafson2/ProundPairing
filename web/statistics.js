// set margin
const margin = { top: 80, right: 60, bottom: 60, left: 100 };
const width = 800 - margin.left - margin.right;
const height = 600 - margin.top - margin.bottom;

const pround_pairing = document.getElementById("pround-pairing");

if (pround_pairing) {
    pround_pairing.addEventListener("click", function() {
        window.location.href = "index.html"; 
    });
}