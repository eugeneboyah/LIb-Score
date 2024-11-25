    //  main nav abr

    // Wait for the DOM to load
document.addEventListener("DOMContentLoaded", function () {
    // Select all navigation tab links
    const navLinks = document.querySelectorAll(".nav-tabs .nav-link");

    // Add click event listener to each tab
    navLinks.forEach((link) => {
        link.addEventListener("click", function (e) {
            e.preventDefault(); // Prevent default link behavior if necessary
            // Remove 'active' class from all tabs
            navLinks.forEach((link) => link.classList.remove("active"));
            // Add 'active' class to the clicked tab
            this.classList.add("active");
        });
    });
});

     
     
     //   aside navigattion
          
          // Wait until the DOM is fully loaded
    document.addEventListener("DOMContentLoaded", function () {
    // Get all elements with the class 'league-item'
    const leagueItems = document.querySelectorAll(".league-item");

    // Add click event listeners to each league item
    leagueItems.forEach((item) => {
        item.addEventListener("click", function () {
            // Remove 'active' class from all league items
            leagueItems.forEach((league) => league.classList.remove("active"));

            // Add 'active' class to the clicked item
            this.classList.add("active");
        });
    });
});


        // main scorebar nav
document.addEventListener("DOMContentLoaded", function () {
    // Main Navbar Buttons
    const navbarButtons = document.querySelectorAll(".main-navbtn .btn-hover");
    navbarButtons.forEach((button) => {
        button.addEventListener("click", function () {
            // Remove active class from all buttons
            navbarButtons.forEach((btn) => btn.classList.remove("active-btn"));
            // Add active class to the clicked button
            this.classList.add("active-btn");
        });
    });

    // Fixtures and Results Tabs
    const tabButtons = document.querySelectorAll(".tabs-container .btn-tab");
    tabButtons.forEach((button) => {
        button.addEventListener("click", function () {
            // Remove active class from all tabs
            tabButtons.forEach((btn) => btn.classList.remove("active-tab"));
            // Add active class to the clicked tab
            this.classList.add("active-tab");
        });
    });
});