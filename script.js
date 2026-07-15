const navToggle = document.querySelector('.nav-toggle');
const siteNav = document.querySelector('#site-nav');

if (navToggle && siteNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = siteNav.dataset.open === 'true';
    siteNav.dataset.open = String(!isOpen);
    navToggle.setAttribute('aria-expanded', String(!isOpen));
  });

  siteNav.addEventListener('click', (event) => {
    if (event.target instanceof HTMLAnchorElement && window.matchMedia('(max-width: 860px)').matches) {
      siteNav.dataset.open = 'false';
      navToggle.setAttribute('aria-expanded', 'false');
    }
  });
}
