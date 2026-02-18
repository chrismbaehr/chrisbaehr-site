(() => {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollBehavior = prefersReducedMotion ? "auto" : "smooth";

  const initSamePageLinks = () => {
    const samePageLinks = document.querySelectorAll('a[href^="#"]');
    samePageLinks.forEach((link) => {
      link.addEventListener("click", (event) => {
        const targetId = link.getAttribute("href");
        if (!targetId || targetId === "#") {
          return;
        }

        const target = document.querySelector(targetId);
        if (!target) {
          return;
        }

        event.preventDefault();
        target.scrollIntoView({ behavior: scrollBehavior, block: "start" });
      });
    });
  };

  const loadFirstAvailableImage = (paths) => {
    return new Promise((resolve) => {
      let index = 0;
      const probe = new Image();

      const attempt = () => {
        if (index >= paths.length) {
          resolve(null);
          return;
        }
        probe.src = paths[index];
      };

      probe.onload = () => resolve(paths[index]);
      probe.onerror = () => {
        index += 1;
        attempt();
      };

      attempt();
    });
  };

  const getGalleryColumnCount = (grid) => {
    const raw = getComputedStyle(grid).getPropertyValue("--gallery-columns").trim();
    const columns = Number.parseInt(raw, 10);
    if (!Number.isNaN(columns) && columns > 0) {
      return columns;
    }
    return 2;
  };

  const createAdventureCard = (item, idx) => {
    const figure = document.createElement("figure");
    figure.className = "photo-card";

    const img = document.createElement("img");
    img.src = item.src;
    img.alt = `Adventure photo ${item.id}`;
    img.loading = idx < 2 ? "eager" : "lazy";
    img.decoding = "async";
    img.tabIndex = 0;
    img.setAttribute("role", "button");
    img.setAttribute("aria-label", `${img.alt}. Open full size image.`);

    figure.appendChild(img);
    return figure;
  };

  const initAdventureGallery = () => {
    const grid = document.querySelector('.photo-grid[data-gallery="adventure"]');
    if (!grid) {
      return;
    }

    const section = document.getElementById("adventure-gallery-section");
    const prefix = grid.dataset.prefix || "adventure-";
    const max = Number.parseInt(grid.dataset.max || "30", 10);
    const extensions = (grid.dataset.exts || "jpg,jpeg,png,webp,avif")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);

    let foundItems = [];
    let resizeFrame = 0;

    const renderGallery = () => {
      if (!foundItems.length) {
        grid.replaceChildren();
        return;
      }

      const columns = getGalleryColumnCount(grid);
      const columnNodes = Array.from({ length: columns }, () => {
        const col = document.createElement("div");
        col.className = "photo-column";
        return col;
      });

      foundItems.forEach((item, idx) => {
        const card = createAdventureCard(item, idx);
        columnNodes[idx % columns].appendChild(card);
      });

      grid.replaceChildren(...columnNodes);
    };

    const tasks = [];
    for (let i = 1; i <= max; i += 1) {
      const id = String(i).padStart(2, "0");
      const paths = extensions.map((ext) => `./assets/${prefix}${id}.${ext}`);
      tasks.push(
        loadFirstAvailableImage(paths).then((src) => ({ id, src }))
      );
    }

    Promise.all(tasks).then((results) => {
      foundItems = results.filter((item) => item.src);

      if (foundItems.length === 0) {
        if (section) {
          section.hidden = true;
        }
        return;
      }

      if (section) {
        section.hidden = false;
      }
      renderGallery();
    });

    window.addEventListener("resize", () => {
      if (!foundItems.length) {
        return;
      }
      if (resizeFrame) {
        cancelAnimationFrame(resizeFrame);
      }
      resizeFrame = requestAnimationFrame(renderGallery);
    });
  };

  const initPhotoLightbox = () => {
    const grid = document.querySelector('.photo-grid[data-gallery="adventure"]');
    if (!grid) {
      return;
    }

    const lightbox = document.createElement("div");
    lightbox.className = "photo-lightbox";
    lightbox.hidden = true;
    lightbox.setAttribute("role", "dialog");
    lightbox.setAttribute("aria-modal", "true");
    lightbox.setAttribute("aria-label", "Expanded adventure photo");

    lightbox.innerHTML = [
      '<div class="photo-lightbox-frame">',
      '<button class="photo-lightbox-close" type="button" aria-label="Close expanded image">Close</button>',
      '<img class="photo-lightbox-image" alt="Expanded adventure photo">',
      "</div>"
    ].join("");

    document.body.appendChild(lightbox);

    const closeButton = lightbox.querySelector(".photo-lightbox-close");
    const lightboxImage = lightbox.querySelector(".photo-lightbox-image");
    let lastFocused = null;

    const closeLightbox = () => {
      if (lightbox.hidden) {
        return;
      }

      lightbox.hidden = true;
      lightboxImage.removeAttribute("src");
      document.body.classList.remove("lightbox-open");

      if (lastFocused && typeof lastFocused.focus === "function") {
        lastFocused.focus();
      }
      lastFocused = null;
    };

    const openLightbox = (img) => {
      if (!img || !img.src) {
        return;
      }

      lastFocused = document.activeElement;
      lightboxImage.src = img.currentSrc || img.src;
      lightboxImage.alt = img.alt || "Expanded adventure photo";
      lightbox.hidden = false;
      document.body.classList.add("lightbox-open");
      closeButton.focus();
    };

    grid.addEventListener("click", (event) => {
      const img = event.target.closest("img");
      if (!img || !grid.contains(img)) {
        return;
      }
      openLightbox(img);
    });

    grid.addEventListener("keydown", (event) => {
      const isActivateKey = event.key === "Enter" || event.key === " ";
      if (!isActivateKey) {
        return;
      }

      const img = event.target.closest("img");
      if (!img || !grid.contains(img)) {
        return;
      }

      event.preventDefault();
      openLightbox(img);
    });

    closeButton.addEventListener("click", closeLightbox);

    lightbox.addEventListener("click", (event) => {
      if (event.target === lightbox) {
        closeLightbox();
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeLightbox();
      }
    });
  };

  const initCursorGarden = () => {
    const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    if (!finePointer) {
      return;
    }

    const layer = document.createElement("div");
    layer.className = "cursor-garden-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);

    const treeSvg = [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path fill="currentColor" d="M12 2 5 11h3l-2 4h4l-2 4h8l-2-4h4l-2-4h3L12 2Z"/>',
      '<rect x="11" y="18" width="2" height="4" fill="currentColor"/>',
      "</svg>"
    ].join("");

    const vineSvg = [
      '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">',
      '<path d="M3 20c6-3 6-13 15-15" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/>',
      '<path d="M10 11c2-2 5-2 7 1-3 1-5 1-7-1Z" fill="currentColor"/>',
      '<path d="M6 16c2-1 4-1 5 2-2 1-4 1-5-2Z" fill="currentColor"/>',
      "</svg>"
    ].join("");

    const maxNodes = 120;
    const minIntervalMs = 22;
    let lastSpawn = 0;
    let nodeCount = 0;

    const random = (min, max) => Math.random() * (max - min) + min;

    const spawn = (x, y) => {
      if (nodeCount >= maxNodes) {
        return;
      }

      nodeCount += 1;
      const isTree = Math.random() > 0.45;
      const node = document.createElement("span");
      node.className = `cursor-garden ${isTree ? "cursor-garden--tree" : "cursor-garden--vine"}`;
      node.style.left = `${x + random(-6, 6)}px`;
      node.style.top = `${y + random(-6, 6)}px`;
      node.style.setProperty("--grow-rot", `${random(-25, 25)}deg`);
      node.style.setProperty("--grow-scale", `${random(0.75, 1.2)}`);
      node.innerHTML = isTree ? treeSvg : vineSvg;
      layer.appendChild(node);

      const cleanup = () => {
        if (!node.isConnected) {
          return;
        }
        node.remove();
        nodeCount = Math.max(0, nodeCount - 1);
      };

      node.addEventListener("animationend", cleanup, { once: true });
      window.setTimeout(cleanup, 850);
    };

    window.addEventListener("pointermove", (event) => {
      const now = performance.now();
      if (now - lastSpawn < minIntervalMs) {
        return;
      }

      lastSpawn = now;
      spawn(event.clientX, event.clientY);
      if (Math.random() > 0.55) {
        spawn(event.clientX + random(-12, 12), event.clientY + random(-10, 10));
      }
    });

    window.addEventListener("pointerdown", (event) => {
      spawn(event.clientX, event.clientY);
      spawn(event.clientX + random(-10, 10), event.clientY + random(-10, 10));
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        layer.textContent = "";
        nodeCount = 0;
      }
    });
  };

  initSamePageLinks();
  initAdventureGallery();
  initPhotoLightbox();

  if (prefersReducedMotion) {
    return;
  }

  initCursorGarden();
})();