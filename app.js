const categories = [
  { id: "all", name: "Alle Artikel" },
  { id: "favorites", name: "Favoriten" },
  { id: "burger", name: "Burger" },
  { id: "beilagen", name: "Beilagen" },
  { id: "getraenke", name: "Getränke" },
  { id: "dessert", name: "Dessert" }
];

const products = [
  {
    id: 1,
    name: "Cheeseburger",
    description: "Rindfleisch, Cheddar, Salat, Sauce",
    price: 8.9,
    category: "burger",
    emoji: "🍔",
    color: "#fff0e6",
    favorite: true
  },
  {
    id: 2,
    name: "Classic Burger",
    description: "Rindfleisch, Salat, Tomate, Sauce",
    price: 8.5,
    category: "burger",
    emoji: "🍔",
    color: "#ffedd5",
    favorite: false
  },
  {
    id: 3,
    name: "Chicken Burger",
    description: "Knuspriges Hähnchen, Salat, Sauce",
    price: 8.9,
    category: "burger",
    emoji: "🍗",
    color: "#fef3c7",
    favorite: true
  },
  {
    id: 4,
    name: "Vegan Burger",
    description: "Plant Patty, Salat, Tomate, Sauce",
    price: 9.4,
    category: "burger",
    emoji: "🥬",
    color: "#dcfce7",
    favorite: false
  },
  {
    id: 5,
    name: "Pommes klein",
    description: "Knusprige Pommes Frites",
    price: 3.5,
    category: "beilagen",
    emoji: "🍟",
    color: "#fef3c7",
    favorite: true
  },
  {
    id: 6,
    name: "Pommes groß",
    description: "Knusprige Pommes Frites",
    price: 4.5,
    category: "beilagen",
    emoji: "🍟",
    color: "#fde68a",
    favorite: false
  },
  {
    id: 7,
    name: "Onion Rings",
    description: "6 Stück, knusprig paniert",
    price: 4.9,
    category: "beilagen",
    emoji: "🧅",
    color: "#ffedd5",
    favorite: false
  },
  {
    id: 8,
    name: "Cola 0,5 l",
    description: "Erfrischungsgetränk",
    price: 3.9,
    category: "getraenke",
    emoji: "🥤",
    color: "#dbeafe",
    favorite: true
  },
  {
    id: 9,
    name: "Wasser still 0,5 l",
    description: "Mineralwasser ohne Kohlensäure",
    price: 3.2,
    category: "getraenke",
    emoji: "💧",
    color: "#e0f2fe",
    favorite: false
  },
  {
    id: 10,
    name: "Wasser sprudel 0,5 l",
    description: "Mineralwasser mit Kohlensäure",
    price: 3.2,
    category: "getraenke",
    emoji: "🫧",
    color: "#e0f2fe",
    favorite: false
  },
  {
    id: 11,
    name: "Brownie",
    description: "Schoko-Brownie mit Vanillesauce",
    price: 4.9,
    category: "dessert",
    emoji: "🍫",
    color: "#f3e8ff",
    favorite: true
  },
  {
    id: 12,
    name: "Cookie",
    description: "Frisch gebackener Chocolate Chip Cookie",
    price: 2.9,
    category: "dessert",
    emoji: "🍪",
    color: "#fef3c7",
    favorite: false
  }
];

const state = {
  activeCategory: "all",
  searchTerm: "",
  favoritesOnly: false,
  cart: []
};

const elements = {
  categoryList: document.querySelector("#category-list"),
  productGrid: document.querySelector("#product-grid"),
  categoryTitle: document.querySelector("#category-title"),
  productCount: document.querySelector("#product-count"),
  productSearch: document.querySelector("#product-search"),
  favoritesButton: document.querySelector("#favorites-button"),
  cartItems: document.querySelector("#cart-items"),
  subtotalValue: document.querySelector("#subtotal-value"),
  taxValue: document.querySelector("#tax-value"),
  totalValue: document.querySelector("#total-value"),
  clearCartButton: document.querySelector("#clear-cart-button"),
  paymentButton: document.querySelector("#payment-button"),
  parkOrderButton: document.querySelector("#park-order-button"),
  toastContainer: document.querySelector("#toast-container"),
  currentDate: document.querySelector("#current-date")
};

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR"
  }).format(value);
}

function getFilteredProducts() {
  const normalizedSearch = state.searchTerm.trim().toLowerCase();

  return products.filter((product) => {
    const categoryMatches =
      state.activeCategory === "all" ||
      state.activeCategory === "favorites" ||
      product.category === state.activeCategory;

    const favoritesMatch =
      state.activeCategory !== "favorites" && !state.favoritesOnly
        ? true
        : product.favorite;

    const searchMatches =
      !normalizedSearch ||
      product.name.toLowerCase().includes(normalizedSearch) ||
      product.description.toLowerCase().includes(normalizedSearch);

    return categoryMatches && favoritesMatch && searchMatches;
  });
}

function getCategoryTitle() {
  if (state.favoritesOnly) {
    return "Favoriten";
  }

  return categories.find((category) => category.id === state.activeCategory)?.name || "Artikel";
}

function renderCategories() {
  elements.categoryList.innerHTML = categories
    .map((category) => {
      const isActive = state.activeCategory === category.id && !state.favoritesOnly;

      return `
        <button
          class="category-button ${isActive ? "active" : ""}"
          type="button"
          data-category-id="${category.id}"
        >
          ${category.name}
        </button>
      `;
    })
    .join("");

  document.querySelectorAll("[data-category-id]").forEach((button) => {
    button.addEventListener("click", () => {
      state.activeCategory = button.dataset.categoryId;
      state.favoritesOnly = false;
      renderProducts();
      renderCategories();
    });
  });
}

function renderProducts() {
  const filteredProducts = getFilteredProducts();

  elements.categoryTitle.textContent = getCategoryTitle();
  elements.productCount.textContent = `${filteredProducts.length} ${
    filteredProducts.length === 1 ? "Artikel" : "Artikel verfügbar"
  }`;

  elements.favoritesButton.classList.toggle("active", state.favoritesOnly);

  if (filteredProducts.length === 0) {
    elements.productGrid.innerHTML = `
      <div class="empty-products">
        <strong>Keine Artikel gefunden</strong>
        <p>Ändere die Suche oder wähle eine andere Kategorie.</p>
      </div>
    `;
    return;
  }

  elements.productGrid.innerHTML = filteredProducts
    .map(
      (product) => `
        <button class="product-card" type="button" data-product-id="${product.id}">
          <span
            class="product-emoji"
            style="background: ${product.color};"
          >
            ${product.emoji}
          </span>

          <span class="product-favorite ${product.favorite ? "is-favorite" : ""}">
            ${product.favorite ? "★" : "☆"}
          </span>

          <span>
            <span class="product-name">${product.name}</span>
            <span class="product-description">${product.description}</span>
          </span>

          <span class="product-price">${formatCurrency(product.price)}</span>
        </button>
      `
    )
    .join("");

  document.querySelectorAll("[data-product-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const productId = Number(button.dataset.productId);
      addToCart(productId);
    });
  });
}

function addToCart(productId) {
  const product = products.find((item) => item.id === productId);

  if (!product) {
    return;
  }

  const cartItem = state.cart.find((item) => item.productId === productId);

  if (cartItem) {
    cartItem.quantity += 1;
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      price: product.price,
      quantity: 1
    });
  }

  renderCart();
  showToast(`${product.name} wurde hinzugefügt.`, "success");
}

function changeQuantity(productId, amount) {
  const cartItem = state.cart.find((item) => item.productId === productId);

  if (!cartItem) {
    return;
  }

  cartItem.quantity += amount;

  if (cartItem.quantity <= 0) {
    state.cart = state.cart.filter((item) => item.productId !== productId);
  }

  renderCart();
}

function getCartTotals() {
  const subtotal = state.cart.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const tax = subtotal - subtotal / 1.19;

  return {
    subtotal,
    tax,
    total: subtotal
  };
}

function renderCart() {
  const { subtotal, tax, total } = getCartTotals();
  const hasItems = state.cart.length > 0;

  elements.clearCartButton.disabled = !hasItems;
  elements.paymentButton.disabled = !hasItems;
  elements.parkOrderButton.disabled = !hasItems;

  if (!hasItems) {
    elements.cartItems.innerHTML = `
      <div class="empty-cart">
        <div class="empty-cart-icon">⌑</div>
        <h3>Noch keine Artikel</h3>
        <p>Wähle links einen Artikel aus, um ihn dem Bon hinzuzufügen.</p>
      </div>
    `;
  } else {
    elements.cartItems.innerHTML = state.cart
      .map(
        (item) => `
          <article class="cart-item">
            <div>
              <p class="cart-item-name">${item.name}</p>
              <p class="cart-item-price">${formatCurrency(item.price)} pro Stück</p>
            </div>

            <div>
              <div class="cart-item-total">
                ${formatCurrency(item.price * item.quantity)}
              </div>

              <div class="quantity-control">
                <button
                  class="quantity-button"
                  type="button"
                  data-quantity-action="decrease"
                  data-product-id="${item.productId}"
                  aria-label="${item.name} verringern"
                >
                  −
                </button>

                <span class="quantity-value">${item.quantity}</span>

                <button
                  class="quantity-button"
                  type="button"
                  data-quantity-action="increase"
                  data-product-id="${item.productId}"
                  aria-label="${item.name} erhöhen"
                >
                  +
                </button>
              </div>
            </div>
          </article>
        `
      )
      .join("");

    document.querySelectorAll("[data-quantity-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const productId = Number(button.dataset.productId);
        const amount = button.dataset.quantityAction === "increase" ? 1 : -1;
        changeQuantity(productId, amount);
      });
    });
  }

  elements.subtotalValue.textContent = formatCurrency(subtotal);
  elements.taxValue.textContent = formatCurrency(tax);
  elements.totalValue.textContent = formatCurrency(total);
}

function clearCart() {
  if (state.cart.length === 0) {
    return;
  }

  state.cart = [];
  renderCart();
  showToast("Der Bon wurde geleert.", "warning");
}

function showToast(message, type = "") {
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  elements.toastContainer.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 2600);
}

function setCurrentDate() {
  const date = new Intl.DateTimeFormat("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(new Date());

  elements.currentDate.textContent = date;
}

function setupEventListeners() {
  elements.productSearch.addEventListener("input", (event) => {
    state.searchTerm = event.target.value;
    renderProducts();
  });

  elements.productSearch.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.target.value = "";
      state.searchTerm = "";
      renderProducts();
      event.target.blur();
    }
  });

  elements.favoritesButton.addEventListener("click", () => {
    state.favoritesOnly = !state.favoritesOnly;

    if (state.favoritesOnly) {
      state.activeCategory = "all";
    }

    renderCategories();
    renderProducts();
  });

  elements.clearCartButton.addEventListener("click", clearCart);

  elements.parkOrderButton.addEventListener("click", () => {
    if (state.cart.length === 0) {
      return;
    }

    showToast("Demo: Der Bon wurde geparkt.", "success");
  });

  elements.paymentButton.addEventListener("click", () => {
    const { total } = getCartTotals();

    if (total <= 0) {
      return;
    }

    showToast(
      `Demo: Zahlung über ${formatCurrency(total)} wird vorbereitet.`,
      "success"
    );
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "F2") {
      event.preventDefault();
      elements.productSearch.focus();
    }
  });
}

function init() {
  setCurrentDate();
  renderCategories();
  renderProducts();
  renderCart();
  setupEventListeners();
}

init();