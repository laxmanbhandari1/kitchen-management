// --- 1. INTRO SWIPE LOGIC ---
      let currentSlide = 1;
      function nextIntro() {
        if (currentSlide < 3) {
          document
            .getElementById(`slide-${currentSlide}`)
            .classList.remove("active");
          document
            .getElementById(`dot-${currentSlide}`)
            .classList.remove("active");
          currentSlide++;
          document
            .getElementById(`slide-${currentSlide}`)
            .classList.add("active");
          document
            .getElementById(`dot-${currentSlide}`)
            .classList.add("active");
          if (currentSlide === 3) {
            document.getElementById("intro-next-btn").innerText = "Get Started";
          }
        } else {
          localStorage.setItem('shell.introSeen.v1', 'true');
          document.getElementById("intro-screen").classList.remove("active");
          document.getElementById("login-screen").classList.add("active");
        }
      }

// Show the welcome slides only on the first visit to this browser.
window.addEventListener('DOMContentLoaded', () => {
  const seen = localStorage.getItem('shell.introSeen.v1') === 'true';
  if (seen) {
    document.getElementById('intro-screen')?.classList.remove('active');
    document.getElementById('login-screen')?.classList.add('active');
  }
});
