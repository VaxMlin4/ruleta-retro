/* global gsap */
window.CelebrationAnim = {
  burst(container) {
    const n = 18;
    for (let i = 0; i < n; i++) {
      const s = document.createElement('div');
      s.className = 'sparkle';
      s.style.left = 50 + (Math.random() * 60 - 30) + '%';
      s.style.top = 40 + (Math.random() * 40 - 20) + '%';
      s.style.width = 6 + Math.random() * 10 + 'px';
      s.style.height = s.style.width;
      container.appendChild(s);
      gsap.fromTo(
        s,
        { opacity: 0, scale: 0 },
        {
          opacity: 1,
          scale: 1,
          duration: 0.4,
          delay: Math.random() * 0.5,
          yoyo: true,
          repeat: 3,
          onComplete: () => s.remove(),
        }
      );
    }
  },

  slowReveal(rows, onStep) {
    // For UI7 — reveal winners slowly
    const tl = gsap.timeline();
    rows.forEach((row, i) => {
      gsap.set(row, { opacity: 0, y: 12 });
      tl.to(row, { opacity: 1, y: 0, duration: 0.45, onStart: () => onStep && onStep(i) }, i * 0.35);
    });
    return tl;
  },
};
