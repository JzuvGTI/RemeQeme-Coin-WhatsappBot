const SHOP_ITEMS = {
  champ: {
    code: "champ",
    name: "Champagne",
    category: "Minuman",
    price: 500,
    description: "Luck boost untuk 1x spin berikutnya."
  }
};

const getShopItem = (code) => {
  const key = String(code || "").trim().toLowerCase();
  return SHOP_ITEMS[key] ? { ...SHOP_ITEMS[key] } : null;
};

const listShopItems = () => Object.values(SHOP_ITEMS).map((item) => ({ ...item }));

module.exports = {
  SHOP_ITEMS,
  getShopItem,
  listShopItems
};
