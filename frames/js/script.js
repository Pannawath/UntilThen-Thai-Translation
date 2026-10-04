(function() {
  // Configuration for 250 Full HD Frames
  const TOTAL_FRAMES = 250;

  // 1. HOME IDLE: Frames 1 to 19 (Ping-Pong: 1 -> 19 -> 1)
  const HOME_IDLE_START = 1;
  const HOME_IDLE_END = 19;

  // 2. WALK 1 (Home to About): Frames 20 to 79
  const WALK1_START = 20;
  const WALK1_END = 79;

  // 3. ABOUT IDLE: Frames 80 to 150 (Ping-Pong: 80 -> 150 -> 80 in middle!)
  const ABOUT_IDLE_START = 80;
  const ABOUT_IDLE_END = 150;

  // 4. WALK 2 (About to Download): Frames 151 to 209
  const WALK2_START = 151;
  const WALK2_END = 209;

  // 5. DOWNLOAD IDLE: Frames 210 to 250 (Ping-Pong: 210 -> 250 -> 210 at end!)
  const DOWNLOAD_IDLE_START = 210;
  const DOWNLOAD_IDLE_END = 250;

  // Target Frames for Navigation
  const FRAME_HOME = HOME_IDLE_START; // 1
  const FRAME_ABOUT = ABOUT_IDLE_START; // 80
  const FRAME_DOWNLOAD = DOWNLOAD_IDLE_START; // 210

  // Idle Loop Timing (8 FPS for gentle natural breathing)
  const IDLE_FPS = 8;
  const idleInterval = 1000 / IDLE_FPS;

  // DOM Elements
  const canvas = document.getElementById('game-canvas');
  const ctx = canvas.getContext('2d');
  const fallbackImg = document.getElementById('fallback-img');
  const shadowRight = document.getElementById('shadow-right');
  const shadowLeft = document.getElementById('shadow-left');
  const panelHome = document.getElementById('panel-home');
  const panelAbout = document.getElementById('panel-about');
  const panelDownload = document.getElementById('panel-download');
  const navHome = document.getElementById('nav-home');
  const navAbout = document.getElementById('nav-about');
  const navDownload = document.getElementById('nav-download');
  const scrollThumb = document.getElementById('scroll-thumb');
  const versionText = document.getElementById('mod-version');

  fetch('version.txt', { cache: 'no-store' })
    .then(response => {
      if (!response.ok) {
        throw new Error(`Failed to load version.txt: ${response.status}`);
      }
      return response.text();
    })
    .then(version => {
      versionText.textContent = `v${version.trim()}`;
    })
    .catch(error => {
      console.error(error);
    });

  // Mouse Interaction & Parallax State
  let mouseX = 0;
  let mouseY = 0;
  let smoothMouseX = 0;
  let smoothMouseY = 0;

  const canvasWrapper = document.getElementById('canvas-wrapper');
  const homeBox = document.querySelector('.home-box');
  const aboutBox = document.querySelector('.about-box');
  const downloadBox = document.querySelector('.download-box');

  // State
  const frames = [];
  let displayedFrame = 1;

  // Scroll system (0.0 to 1.0)
  let scrollProgress = 0.0;
  let targetProgress = 0.0;

  // Idle Animation States
  let homeIdleFrame = 1;
  let homeIdleDir = 1;
  let lastHomeIdleTime = 0;

  let aboutIdleFrame = 80;
  let aboutIdleDir = 1;
  let lastAboutIdleTime = 0;

  let downloadIdleFrame = 210;
  let downloadIdleDir = 1;
  let lastDownloadIdleTime = 0;

  // Navigation / Walk Queue State
  let isAutoNavigating = false;
  let lastAutoWalkTime = 0;
  let walkQueue = [];
  let totalWalkSteps = 1;
  let navStartProgress = 0.0;

  // Frame filename helper (organized under assets/frames/)
  function getFilename(i) {
    const pad = String(i).padStart(3, '0');
    return `assets/frames/frame-${pad}.jpg`;
  }

  // Preload images into memory (with graceful fallback)
  function preloadImages() {
    for (let i = 1; i <= TOTAL_FRAMES; i++) {
      const img = new Image();
      const pad = String(i).padStart(3, '0');
      img.src = `assets/frames/frame-${pad}.jpg`;
      img.onerror = () => {
        if (!img.dataset.retried) {
          img.dataset.retried = 'true';
          img.src = `frame-${pad}.jpg`;
        }
      };
      img.onload = () => {
        if (i === 1) render(1);
      };
      frames[i] = img;
    }
  }

  // Resize Canvas for High-DPI (Retina / 4K / Display Scaling)
  function resizeCanvas() {
    const dpr = Math.max(window.devicePixelRatio || 1, 1);
    canvas.width = Math.round(window.innerWidth * dpr);
    canvas.height = Math.round(window.innerHeight * dpr);
    render(displayedFrame);
  }
  window.addEventListener('resize', resizeCanvas);

  // Render Frame with High Sharpness
  function render(frameIndex) {
    const img = frames[frameIndex] || fallbackImg;
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const cw = canvas.width;
    const ch = canvas.height;

    ctx.clearRect(0, 0, cw, ch);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    // Aspect ratio 1600:900 cover fit
    const imgRatio = 1600 / 900;
    const canvasRatio = cw / ch;

    let dw, dh, dx, dy;
    if (canvasRatio > imgRatio) {
      dw = cw;
      dh = cw / imgRatio;
      dx = 0;
      dy = (ch - dh) / 2;
    } else {
      dh = ch;
      dw = ch * imgRatio;
      dx = (cw - dw) / 2;
      dy = 0;
    }

    ctx.drawImage(img, dx, dy, dw, dh);

    if (fallbackImg.style.display !== 'none') {
      fallbackImg.style.display = 'none';
    }
  }

  // ========================================================
  // WHITE SLIDE-UP SHEET & PROGRESSIVE CONTINUOUS WHEEL NAVIGATION
  // ========================================================
  const whiteSheet = document.getElementById('white-sheet');
  const customContextMenu = document.getElementById('custom-context-menu');
  const sheetTimelineNav = document.querySelector('.sheet-timeline-nav');
  const navSocials = document.querySelector('.nav-socials');
  const sheetTimelineNavParent = sheetTimelineNav && sheetTimelineNav.parentNode;
  const sheetTimelineNavNextSibling = sheetTimelineNav && sheetTimelineNav.nextSibling;
  const navSocialsParent = navSocials && navSocials.parentNode;
  const navSocialsNextSibling = navSocials && navSocials.nextSibling;
  const mobileSheetQuery = window.matchMedia('(max-width: 768px)');
  let isWhiteSheetOpen = false;
  let sheetProgress = 0.0;
  let targetSheetProgress = 0.0;

  function positionSheetTimelineNav() {
    if (mobileSheetQuery.matches) {
      if (sheetTimelineNav && sheetTimelineNav.parentNode !== document.body) {
        document.body.appendChild(sheetTimelineNav);
      }
      if (sheetTimelineNav) sheetTimelineNav.classList.add('mobile-floating');
      if (navSocials && navSocials.parentNode !== document.body) {
        document.body.appendChild(navSocials);
      }
      if (navSocials) navSocials.classList.add('mobile-floating-socials');
      return;
    }

    if (sheetTimelineNav) sheetTimelineNav.classList.remove('mobile-floating', 'is-sheet-visible');
    if (sheetTimelineNav && sheetTimelineNavParent && sheetTimelineNav.parentNode !== sheetTimelineNavParent) {
      sheetTimelineNavParent.insertBefore(sheetTimelineNav, sheetTimelineNavNextSibling);
    }
    if (navSocials) navSocials.classList.remove('mobile-floating-socials', 'is-main-visible');
    if (navSocials && navSocialsParent && navSocials.parentNode !== navSocialsParent) {
      navSocialsParent.insertBefore(navSocials, navSocialsNextSibling);
    }
  }

  positionSheetTimelineNav();
  mobileSheetQuery.addEventListener('change', positionSheetTimelineNav);

  // Open White Sheet and optionally scroll to specific section
  window.openWhiteSheet = function(targetSectionId = 'sec-guide') {
    if (!whiteSheet) return;
    isAutoNavigating = false;
    walkQueue = [];
    targetProgress = 1.0;
    targetSheetProgress = 1.0;
    if (sheetTimelineNav && sheetTimelineNav.classList.contains('mobile-floating')) {
      sheetTimelineNav.classList.add('is-sheet-visible');
    }
    hideContextMenu();

    const checkInterval = setInterval(() => {
      if (sheetProgress >= 0.95) {
        clearInterval(checkInterval);
        scrollToSection(targetSectionId);
      }
    }, 40);

    setTimeout(() => {
      clearInterval(checkInterval);
      scrollToSection(targetSectionId);
    }, 550);
  };

  // Close White Sheet
  window.closeWhiteSheet = function() {
    if (!whiteSheet) return;
    targetSheetProgress = 0.0;
    if (sheetTimelineNav && sheetTimelineNav.classList.contains('mobile-floating')) {
      sheetTimelineNav.classList.remove('is-sheet-visible');
    }
  };

  // Smooth scroll directly to section or card inside White Sheet
  window.scrollToSection = function(id) {
    if (!whiteSheet) return;

    // Support shorthand aliases
    const aliasMap = {
      'guide': 'sec-guide',
      'bugs': 'sec-bugs',
      'credit': 'sec-credit',
      'donate': 'sec-donate'
    };
    const targetId = aliasMap[id] || id;
    const targetEl = document.getElementById(targetId);
    if (!targetEl) return;

    // Immediate visual feedback for clicked subitem
    document.querySelectorAll('.timeline-subitem').forEach(subItem => {
      subItem.classList.toggle('active-sub', subItem.getAttribute('data-target') === targetId);
    });

    if (sheetProgress < 0.95) {
      window.openWhiteSheet(targetId);
      return;
    }

    const targetRect = targetEl.getBoundingClientRect();
    const sheetRect = whiteSheet.getBoundingClientRect();
    const targetScrollTop = targetRect.top - sheetRect.top + whiteSheet.scrollTop - 24;

    whiteSheet.scrollTo({
      top: Math.max(0, targetScrollTop),
      behavior: 'smooth'
    });
  };

  // ========================================================
  // SCROLLSPY ENGINE (Dynamic Left Sidebar Highlight on Scroll)
  // ========================================================
  function updateScrollSpy() {
    if (!whiteSheet || !isWhiteSheetOpen) return;

    const scrollBottomDist = whiteSheet.scrollHeight - whiteSheet.scrollTop - whiteSheet.clientHeight;
    const isAtAbsoluteBottom = scrollBottomDist <= 25;

    const mainSections = [
      { id: 'sec-guide', navId: 'nav-item-guide' },
      { id: 'sec-bugs', navId: 'nav-item-bugs' },
      { id: 'sec-credit', navId: 'nav-item-credit' },
      { id: 'sec-donate', navId: 'nav-item-donate' }
    ];

    let currentMainId = mainSections[0].id;
    const triggerOffset = Math.max(220, window.innerHeight * 0.32);

    if (isAtAbsoluteBottom) {
      currentMainId = 'sec-donate';
    } else {
      mainSections.forEach(sec => {
        const el = document.getElementById(sec.id);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top <= triggerOffset) {
            currentMainId = sec.id;
          }
        }
      });
    }

    // Update main timeline items
    mainSections.forEach(sec => {
      const navItem = document.getElementById(sec.navId);
      if (navItem) {
        navItem.classList.toggle('active', sec.id === currentMainId);
      }
    });

    // 2. Detect active subitem dynamically from all registered subitems
    const subItemEls = document.querySelectorAll('.timeline-subitem');
    let currentSubId = null;

    if (isAtAbsoluteBottom) {
      const lastSub = subItemEls[subItemEls.length - 1];
      if (lastSub) currentSubId = lastSub.getAttribute('data-target');
    } else {
      const subTriggerOffset = Math.max(240, window.innerHeight * 0.36);
      subItemEls.forEach(subItem => {
        const targetId = subItem.getAttribute('data-target');
        if (targetId) {
          const targetEl = document.getElementById(targetId);
          if (targetEl) {
            const rect = targetEl.getBoundingClientRect();
            if (rect.top <= subTriggerOffset) {
              currentSubId = targetId;
            }
          }
        }
      });
    }

    // Update subitem highlights
    subItemEls.forEach(subItem => {
      const target = subItem.getAttribute('data-target');
      if (target) {
        subItem.classList.toggle('active-sub', target === currentSubId);
      }
    });
  }

  // ========================================================
  // CREDIT CARD NAVIGATION (Vertical Scroll - Guide Style)
  // ========================================================
  
  // Scroll to specific credit card by index
  window.scrollToCreditCard = function(index) {
    const cards = document.querySelectorAll('.credit-card');
    if (index >= 0 && index < cards.length) {
      cards[index].scrollIntoView({
        behavior: 'smooth',
        block: 'start'
      });

      // Update navigation active state
      updateCreditNavActive(index);
    }
  };

  // Update credit navigation active state
  function updateCreditNavActive(activeIndex) {
    const navItems = document.querySelectorAll('.credit-nav-item');
    navItems.forEach((item, idx) => {
      item.classList.toggle('active', idx === activeIndex);
    });
  }

  // Attach ScrollSpy to white sheet scroll container
  if (whiteSheet) {
    whiteSheet.addEventListener('scroll', updateScrollSpy, { passive: true });
  }

  // ========================================================
  // CUSTOM RIGHT-CLICK CONTEXT MENU
  // ========================================================
  window.showContextMenu = function(x, y) {
    if (!customContextMenu) return;
    customContextMenu.style.display = 'block';

    const menuWidth = 240;
    const menuHeight = 240;
    const posX = (x + menuWidth > window.innerWidth) ? (window.innerWidth - menuWidth - 14) : x;
    const posY = (y + menuHeight > window.innerHeight) ? (window.innerHeight - menuHeight - 14) : y;

    customContextMenu.style.left = `${Math.max(10, posX)}px`;
    customContextMenu.style.top = `${Math.max(10, posY)}px`;
    
    // Update color based on current position
    updateContextMenuColor();
  };

  // Real-time color update for context menu
  window.updateContextMenuColor = function() {
    if (!customContextMenu || customContextMenu.style.display === 'none') return;
    
    const menuRect = customContextMenu.getBoundingClientRect();
    const menuCenterY = menuRect.top + menuRect.height / 2;
    
    // Check if menu center overlaps with white sheet
    const isOnWhiteSheet = whiteSheet && sheetProgress > 0.1 && menuCenterY > (window.innerHeight * (1 - sheetProgress));
    
    if (isOnWhiteSheet) {
      customContextMenu.classList.add('dark-mode');
    } else {
      customContextMenu.classList.remove('dark-mode');
    }
  };

  window.hideContextMenu = function() {
    if (customContextMenu) {
      customContextMenu.style.display = 'none';
    }
  };

  window.onContextSelect = function(targetSectionId) {
    hideContextMenu();
    openWhiteSheet(targetSectionId);
  };

  // Right-Click Context Menu Listener (Attached to both window & document for 100% reliability)
  function handleContextMenu(e) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
    return false;
  }
  window.addEventListener('contextmenu', handleContextMenu, { passive: false });
  document.addEventListener('contextmenu', handleContextMenu, { passive: false });

  // Left-Click outside closes Context Menu
  window.addEventListener('click', (e) => {
    if (customContextMenu && !customContextMenu.contains(e.target)) {
      hideContextMenu();
    }
  });

  // ========================================================
  // FOOLPROOF SCROLL ENGINE (Wheel, Touch, Keys, Track)
  // ========================================================

  // 1. Mouse Wheel on WINDOW & WHITE SHEET (Gradually follows mouse wheel roll!)
  window.addEventListener('wheel', (e) => {
    const delta = e.deltaY;

    // Case A: White Sheet is fully docked at top (targetSheetProgress >= 0.98)
    if (targetSheetProgress >= 0.98) {
      // If user reaches the top of the white sheet and continues scrolling UP:
      if (whiteSheet.scrollTop <= 0 && delta < 0) {
        targetSheetProgress += delta * 0.0012;
        targetSheetProgress = Math.max(0, targetSheetProgress);
        whiteSheet.scrollTop = 0;
        return;
      }
      // Otherwise: let normal native content scrolling occur inside whiteSheet
      return;
    }

    // Case B: White Sheet is actively sliding up or down (0 < targetSheetProgress < 0.98)
    if (targetSheetProgress > 0 && targetSheetProgress < 0.98) {
      targetSheetProgress += delta * 0.0012;
      targetSheetProgress = Math.max(0, Math.min(1, targetSheetProgress));
      whiteSheet.scrollTop = 0;
      return;
    }

    // Case C: White Sheet is closed at bottom (targetSheetProgress <= 0)
    // When reaching DOWNLOAD (scrollProgress >= 0.95 or targetProgress >= 0.98) and user scrolls DOWN:
    if ((scrollProgress >= 0.95 || targetProgress >= 0.98) && delta > 0) {
      targetSheetProgress += delta * 0.0012;
      targetSheetProgress = Math.max(0, Math.min(1, targetSheetProgress));
      whiteSheet.scrollTop = 0;
      return;
    }

    // Case D: Game Scene scrolling (Home <-> About <-> Download)
    isAutoNavigating = false;
    walkQueue = [];
    targetProgress += delta * 0.00085;
    targetProgress = Math.max(0, Math.min(1, targetProgress));
  }, { passive: true });

  // 2. Touch Drag / Mobile Swipe
  let touchStartY = 0;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length > 0) touchStartY = e.touches[0].clientY;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (e.touches.length > 0) {
      const currentY = e.touches[0].clientY;
      const diff = touchStartY - currentY;
      touchStartY = currentY;

      if (targetSheetProgress >= 0.98) {
        if (whiteSheet.scrollTop <= 0 && diff < 0) {
          targetSheetProgress += diff * 0.0025;
          targetSheetProgress = Math.max(0, targetSheetProgress);
          whiteSheet.scrollTop = 0;
          return;
        }
        return;
      }

      if (targetSheetProgress > 0 && targetSheetProgress < 0.98) {
        targetSheetProgress += diff * 0.0025;
        targetSheetProgress = Math.max(0, Math.min(1, targetSheetProgress));
        whiteSheet.scrollTop = 0;
        return;
      }

      if ((scrollProgress >= 0.95 || targetProgress >= 0.98) && diff > 0) {
        targetSheetProgress += diff * 0.0025;
        targetSheetProgress = Math.max(0, Math.min(1, targetSheetProgress));
        whiteSheet.scrollTop = 0;
        return;
      }

      isAutoNavigating = false;
      walkQueue = [];
      targetProgress += diff * 0.002;
      targetProgress = Math.max(0, Math.min(1, targetProgress));
    }
  }, { passive: true });

  // 3. Keyboard (Up / Down / PageUp / PageDown / Escape)
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
      closeWhiteSheet();
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === ' ') {
      if (targetSheetProgress >= 0.98) return;
      if (targetSheetProgress > 0 || targetProgress >= 0.98 || scrollProgress >= 0.95) {
        targetSheetProgress = Math.min(1, targetSheetProgress + 0.25);
        return;
      }
      isAutoNavigating = false;
      walkQueue = [];
      targetProgress = Math.min(1, targetProgress + 0.1);
    } else if (e.key === 'ArrowUp' || e.key === 'PageUp') {
      if (targetSheetProgress >= 0.98) {
        if (whiteSheet.scrollTop <= 0) {
          targetSheetProgress = Math.max(0, targetSheetProgress - 0.25);
        }
        return;
      }
      if (targetSheetProgress > 0) {
        targetSheetProgress = Math.max(0, targetSheetProgress - 0.25);
        return;
      }
      isAutoNavigating = false;
      walkQueue = [];
      targetProgress = Math.max(0, targetProgress - 0.1);
    } else if (e.key === 'Home') {
      targetSheetProgress = 0.0;
      goToSection('home');
    } else if (e.key === 'End') {
      targetProgress = 1.0;
      targetSheetProgress = 1.0;
    }
  });

  // 4. Click on vertical scroll track
  window.onProgressTrackClick = function(e) {
    const rect = e.currentTarget.getBoundingClientRect();
    const clickY = e.clientY - rect.top;
    const ratio = Math.max(0, Math.min(1, clickY / rect.height));
    targetProgress = ratio;
    isAutoNavigating = false;
    walkQueue = [];
  };

  // 5. Mouse Move Interaction (2D Screen Pan)
  window.addEventListener('mousemove', (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  }, { passive: true });

  window.addEventListener('mouseleave', () => {
    mouseX = 0;
    mouseY = 0;
  });

  // ========================================================
  // QUEUE-BASED NATURAL WALKING (Frame-by-frame, zero skip, zero stutter)
  // ========================================================
  function buildWalkPath(targetSection) {
    walkQueue = [];
    navStartProgress = scrollProgress;

    if (targetSection === 'download') {
      targetProgress = 1.0;
      if (displayedFrame < 80) {
        // เดินจาก Home ไป Download:
        // เดิน Walk 1 (จนถึงเฟรม 79) แล้วเชื่อม Walk 2 (เฟรม 151 ถึง 209) ข้ามท่า Idle 80..150 ไปเลย 100%!
        const startF = Math.max(20, Math.min(79, displayedFrame));
        for (let f = startF; f <= 79; f++) walkQueue.push(f);
        for (let f = 151; f <= 209; f++) walkQueue.push(f);
        walkQueue.push(210);
      } else if (displayedFrame <= 150) {
        // จาก About ไป Download
        for (let f = 151; f <= 209; f++) walkQueue.push(f);
        walkQueue.push(210);
      } else {
        // อยู่ในโซน Download
        const startF = Math.max(151, Math.min(209, displayedFrame));
        for (let f = startF; f <= 209; f++) walkQueue.push(f);
        walkQueue.push(210);
      }
    } else if (targetSection === 'about') {
      targetProgress = 0.5;
      if (displayedFrame < 80) {
        // จาก Home ไป About
        const startF = Math.max(20, Math.min(79, displayedFrame));
        for (let f = startF; f <= 80; f++) walkQueue.push(f);
      } else if (displayedFrame > 150) {
        // จาก Download ถอยกลับมา About
        const startF = Math.min(209, Math.max(151, displayedFrame));
        for (let f = startF; f >= 151; f--) walkQueue.push(f);
        walkQueue.push(80);
      } else {
        walkQueue.push(80);
      }
    } else if (targetSection === 'home') {
      targetProgress = 0.0;
      if (displayedFrame > 150) {
        // จาก Download ถอยกลับไป Home:
        // เดินถอยหลัง Walk 2 (209 ถอยมา 151) แล้วต่อด้วย Walk 1 (79 ถอยมา 20) ข้ามท่า Idle 80..150 ไปเลย 100%!
        const startF = Math.min(209, Math.max(151, displayedFrame));
        for (let f = startF; f >= 151; f--) walkQueue.push(f);
        for (let f = 79; f >= 20; f--) walkQueue.push(f);
        walkQueue.push(1);
      } else if (displayedFrame >= 80) {
        // จาก About ถอยกลับไป Home
        for (let f = 79; f >= 20; f--) walkQueue.push(f);
        walkQueue.push(1);
      } else {
        const startF = Math.min(79, Math.max(20, displayedFrame));
        for (let f = startF; f >= 20; f--) walkQueue.push(f);
        walkQueue.push(1);
      }
    }

    totalWalkSteps = Math.max(walkQueue.length, 1);
    isAutoNavigating = true;
  }

  window.goToSection = function(section) {
    buildWalkPath(section);
  };

  // Update Active Navigation and Screen Panels
  function updateUI(progress) {
    // Update Scrollbar thumb
    scrollThumb.style.transform = `translateY(${progress * 200}%)`;

    // Section Identification:
    // กล่อง Info จะแสดงก็ต่อเมื่อถึงจุดหมายและตัวละครหยุดนิ่งเท่านั้น ไม่เด้งแทรกกลางทาง!
    const isHome = (!isAutoNavigating && progress <= 0.05) || (isAutoNavigating && targetProgress === 0.0 && progress <= 0.05);
    const isAbout = (!isAutoNavigating && progress >= 0.45 && progress <= 0.55) || (isAutoNavigating && targetProgress === 0.5 && progress >= 0.45 && progress <= 0.55);
    const isDownload = (!isAutoNavigating && progress >= 0.95) || (isAutoNavigating && targetProgress === 1.0 && progress >= 0.95);

    // Toggle info panels cleanly (smooth CSS opacity fade)
    panelHome.classList.toggle('active', isHome);
    panelAbout.classList.toggle('active', isAbout);
    panelDownload.classList.toggle('active', isDownload);

    // Top Navigation indicator highlights
    if (isAutoNavigating) {
      navHome.classList.toggle('active', targetProgress === 0.0);
      navAbout.classList.toggle('active', targetProgress === 0.5);
      navDownload.classList.toggle('active', targetProgress === 1.0);
    } else {
      navHome.classList.toggle('active', progress < 0.25);
      navAbout.classList.toggle('active', progress >= 0.25 && progress < 0.75);
      navDownload.classList.toggle('active', progress >= 0.75);
    }

    // Dynamic Shadows:
    // Home & About: Shadow on RIGHT (Mark on left is 100% uncovered)
    // Download: Shadow on LEFT (Mark on right is 100% uncovered)
    if (progress < 0.75) {
      shadowRight.style.opacity = (isHome || isAbout) ? '1' : '0.35';
      shadowLeft.style.opacity = '0';
    } else {
      shadowRight.style.opacity = '0';
      shadowLeft.style.opacity = isDownload ? '1' : '0.35';
    }
  }

  // ========================================================
  // MAIN ANIMATION LOOP
  // ========================================================
  function tick(time) {
    if (isAutoNavigating) {
      // --- STEP-BY-STEP EXACT FRAME WALKING QUEUE (~33 FPS) ---
      if (time - lastAutoWalkTime > 30) {
        lastAutoWalkTime = time;
        if (walkQueue.length > 0) {
          const nextF = walkQueue.shift();
          displayedFrame = nextF;
          render(displayedFrame);

          // Update scrollProgress smoothly based on progress through the queue
          const stepFraction = 1 - (walkQueue.length / totalWalkSteps);
          scrollProgress = navStartProgress + (targetProgress - navStartProgress) * stepFraction;
        } else {
          scrollProgress = targetProgress;
          isAutoNavigating = false;
        }
      }
    } else {
      // --- MANUAL SCROLL DAMPING ---
      scrollProgress += (targetProgress - scrollProgress) * 0.15;
      if (Math.abs(targetProgress - scrollProgress) < 0.0005) {
        scrollProgress = targetProgress;
      }

      // --- MAP SCROLL PROGRESS DIRECTLY & EXACTLY TO FRAMES ---
      let targetFrame = 1;

      if (scrollProgress <= 0.03) {
        // 1. HOME IDLE: Frames 1 -> 19 -> 1
        if (time - lastHomeIdleTime > idleInterval) {
          homeIdleFrame += homeIdleDir;
          if (homeIdleFrame >= HOME_IDLE_END) { homeIdleFrame = HOME_IDLE_END; homeIdleDir = -1; }
          else if (homeIdleFrame <= HOME_IDLE_START) { homeIdleFrame = HOME_IDLE_START; homeIdleDir = 1; }
          lastHomeIdleTime = time;
        }
        targetFrame = homeIdleFrame;

        aboutIdleFrame = ABOUT_IDLE_START;
        aboutIdleDir = 1;
        downloadIdleFrame = DOWNLOAD_IDLE_START;
        downloadIdleDir = 1;

      } else if (scrollProgress > 0.03 && scrollProgress < 0.47) {
        // 2. WALK 1: Home to About (Frames 20 to 79)
        const fraction = (scrollProgress - 0.03) / (0.47 - 0.03);
        targetFrame = Math.round(WALK1_START + fraction * (WALK1_END - WALK1_START));

        homeIdleFrame = HOME_IDLE_END;
        aboutIdleFrame = ABOUT_IDLE_START;
        aboutIdleDir = 1;

      } else if (scrollProgress >= 0.47 && scrollProgress <= 0.53) {
        // 3. ABOUT IDLE: Frames 80 -> 150 -> 80 (in middle!)
        if (time - lastAboutIdleTime > idleInterval) {
          aboutIdleFrame += aboutIdleDir;
          if (aboutIdleFrame >= ABOUT_IDLE_END) { aboutIdleFrame = ABOUT_IDLE_END; aboutIdleDir = -1; }
          else if (aboutIdleFrame <= ABOUT_IDLE_START) { aboutIdleFrame = ABOUT_IDLE_START; aboutIdleDir = 1; }
          lastAboutIdleTime = time;
        }
        targetFrame = aboutIdleFrame;

        downloadIdleFrame = DOWNLOAD_IDLE_START;
        downloadIdleDir = 1;

      } else if (scrollProgress > 0.53 && scrollProgress < 0.97) {
        // 4. WALK 2: About to Download (Frames 151 to 209)
        const fraction = (scrollProgress - 0.53) / (0.97 - 0.53);
        targetFrame = Math.round(WALK2_START + fraction * (WALK2_END - WALK2_START));

        aboutIdleFrame = ABOUT_IDLE_END;
        downloadIdleFrame = DOWNLOAD_IDLE_START;
        downloadIdleDir = 1;

      } else {
        // 5. DOWNLOAD IDLE: Frames 210 -> 250 -> 210 (at end!)
        if (time - lastDownloadIdleTime > idleInterval) {
          downloadIdleFrame += downloadIdleDir;
          if (downloadIdleFrame >= DOWNLOAD_IDLE_END) { downloadIdleFrame = DOWNLOAD_IDLE_END; downloadIdleDir = -1; }
          else if (downloadIdleFrame <= DOWNLOAD_IDLE_START) { downloadIdleFrame = DOWNLOAD_IDLE_START; downloadIdleDir = 1; }
          lastDownloadIdleTime = time;
        }
        targetFrame = downloadIdleFrame;
      }

      const nextFrame = Math.min(Math.max(targetFrame, 1), TOTAL_FRAMES);
      if (nextFrame !== displayedFrame) {
        displayedFrame = nextFrame;
        render(displayedFrame);
      }
    }

    // --- SCREEN FOLLOWS MOUSE (2D Camera Pan / Parallax, NO 3D) ---
    smoothMouseX += (mouseX - smoothMouseX) * 0.08;
    smoothMouseY += (mouseY - smoothMouseY) * 0.08;

    // Pure 2D camera pan
    const cameraPanX = smoothMouseX * -25;
    const cameraPanY = smoothMouseY * -15;

    canvas.style.transform = `translate(calc(-50% + ${cameraPanX}px), calc(-50% + ${cameraPanY}px)) scale(1.05)`;

    // UI cards 2D parallax float
    const cardShiftX = smoothMouseX * 18;
    const cardShiftY = smoothMouseY * 12;

    if (panelHome.classList.contains('active') && homeBox) {
      homeBox.style.transform = `translate(${cardShiftX}px, ${cardShiftY}px)`;
    } else if (panelAbout.classList.contains('active') && aboutBox) {
      aboutBox.style.transform = `translate(${cardShiftX}px, ${cardShiftY}px)`;
    } else if (panelDownload.classList.contains('active') && downloadBox) {
      downloadBox.style.transform = `translate(${cardShiftX}px, ${cardShiftY}px)`;
    }

    // --- WHITE SHEET PROGRESSIVE WHEEL SLIDE-UP ENGINE ---
    sheetProgress += (targetSheetProgress - sheetProgress) * 0.16;
    if (Math.abs(targetSheetProgress - sheetProgress) < 0.0005) {
      sheetProgress = targetSheetProgress;
    }

    if (whiteSheet) {
      const sheetTranslateY = (1 - sheetProgress) * 100;
      whiteSheet.style.transform = `translateY(${sheetTranslateY.toFixed(2)}%)`;
      whiteSheet.style.pointerEvents = sheetProgress > 0.03 ? 'auto' : 'none';
    }
    if (sheetTimelineNav && sheetTimelineNav.classList.contains('mobile-floating')) {
      sheetTimelineNav.classList.toggle('is-sheet-visible', sheetProgress > 0.03);
    }
    if (navSocials && navSocials.classList.contains('mobile-floating-socials')) {
      navSocials.classList.toggle('is-main-visible', sheetProgress <= 0.03);
    }
    isWhiteSheetOpen = sheetProgress > 0.5;

    // Update context menu color dynamically when sheet is moving
    updateContextMenuColor();

    updateUI(scrollProgress);

    requestAnimationFrame(tick);
  }

  // ========================================================
  // CLIPBOARD UTILITIES (For Terminal Path & Donate)
  // ========================================================
  window.copyPathToClipboard = function(e) {
    const pathText = document.getElementById('steam-path-text')?.innerText || 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Until Then\\';
    navigator.clipboard.writeText(pathText).then(() => {
      const btn = document.getElementById('btn-copy-path');
      if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>คัดลอกแล้ว!</span>';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.classList.remove('copied');
        }, 2200);
      }
    });
  };

  window.copyFromElement = function(elementId, btn) {
    const el = document.getElementById(elementId);
    if (!el) return;
    const textToCopy = el.innerText || el.textContent;
    navigator.clipboard.writeText(textToCopy).then(() => {
      if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> <span>คัดลอกแล้ว!</span>';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.classList.remove('copied');
        }, 2200);
      }
    }).catch(err => {
      console.error('Copy failed:', err);
    });
  };

  window.copyDonateAcc = function(text, btn) {
    if (text.startsWith('http')) {
      window.open(text, '_blank');
      return;
    }
    navigator.clipboard.writeText(text).then(() => {
      if (btn) {
        const origHtml = btn.innerHTML;
        btn.innerHTML = '<i class="fa-solid fa-check"></i> คัดลอกแล้ว!';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.innerHTML = origHtml;
          btn.classList.remove('copied');
        }, 2200);
      }
    });
  };

  // Initialize
  resizeCanvas();
  preloadImages();
  requestAnimationFrame(tick);

})();

const versionText = document.getElementById('mod-version');

fetch('../version.txt')
  .then(response => {
    if (!response.ok) {
      throw new Error(`โหลด version.txt ไม่สำเร็จ: ${response.status}`);
    }
    return response.text();
  })
  .then(version => {
    versionText.textContent = `v${version.trim()}`;
  })
  .catch(error => {
    console.error(error);
    versionText.textContent = 'โหลดเวอร์ชันไม่สำเร็จ';
  });