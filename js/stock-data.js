// Stock item seed data transcribed from the supplied Daily Stock & Prep workbook.
const STOCK_ITEMS = [
  {
    "id": "1-lobster",
    "name": "Lobster",
    "category": "Seafood",
    "cooked": 46,
    "prepUnit": "pcs",
    "useBy": "",
    "raw": 27,
    "rawUnit": "pcs"
  },
  {
    "id": "2-crab",
    "name": "Crab",
    "category": "Seafood",
    "cooked": 3,
    "prepUnit": "pcs",
    "useBy": "2026-10-20",
    "raw": 10,
    "rawUnit": "pcs"
  },
  {
    "id": "10-mussels",
    "name": "Mussels",
    "category": "Seafood",
    "cooked": 8,
    "prepUnit": "kg",
    "useBy": "2026-10-20",
    "raw": 10,
    "rawUnit": "kg"
  },
  {
    "id": "11-oyster",
    "name": "Oyster",
    "category": "Seafood",
    "cooked": 125,
    "prepUnit": "pcs",
    "useBy": "",
    "raw": 0,
    "rawUnit": "pcs"
  },
  {
    "id": "9-whelks",
    "name": "Whelks",
    "category": "Seafood",
    "cooked": 0,
    "prepUnit": "kg",
    "useBy": "8 oct.",
    "raw": 0,
    "rawUnit": "kg"
  },
  {
    "id": "13-squid",
    "name": "Squid",
    "category": "Seafood",
    "cooked": 6,
    "prepUnit": "kg",
    "useBy": "2026-10-19",
    "raw": 4,
    "rawUnit": "box"
  },
  {
    "id": "3-langoustine",
    "name": "Langoustine",
    "category": "Seafood",
    "cooked": 4,
    "prepUnit": "pcs",
    "useBy": "2026-10-01",
    "raw": 1.5,
    "rawUnit": "box"
  },
  {
    "id": "4-snow-crab-legs",
    "name": "Snow crab legs",
    "category": "Seafood",
    "cooked": 1,
    "prepUnit": "portion",
    "useBy": "2026-10-07",
    "raw": 2,
    "rawUnit": "box"
  },
  {
    "id": "18-seabass",
    "name": "Seabass",
    "category": "Seafood",
    "cooked": 4,
    "prepUnit": "pcs",
    "useBy": "2026-10-20",
    "raw": 36,
    "rawUnit": "pcs"
  },
  {
    "id": "17-salmon",
    "name": "Salmon",
    "category": "Seafood",
    "cooked": 8,
    "prepUnit": "pcs",
    "useBy": "2026-10-20",
    "raw": 10,
    "rawUnit": "pcs"
  },
  {
    "id": "16-fish-chips",
    "name": "Fish & chips",
    "category": "Seafood",
    "cooked": 12,
    "prepUnit": "pcs",
    "useBy": "",
    "raw": 14,
    "rawUnit": "box"
  },
  {
    "id": "12-octopus",
    "name": "Octopus",
    "category": "Seafood",
    "cooked": 0,
    "prepUnit": "Leg",
    "useBy": "",
    "raw": 3,
    "rawUnit": "box"
  },
  {
    "id": "15-calamari",
    "name": "Calamari",
    "category": "Seafood",
    "cooked": 0,
    "prepUnit": "bag",
    "useBy": "",
    "raw": 1.5,
    "rawUnit": "box"
  },
  {
    "id": "14-scallops",
    "name": "Scallops",
    "category": "Seafood",
    "cooked": 2,
    "prepUnit": "box",
    "useBy": "",
    "raw": 16,
    "rawUnit": "box"
  },
  {
    "id": "5-prawns",
    "name": "Prawns",
    "category": "Seafood",
    "cooked": 10,
    "prepUnit": "kg",
    "useBy": "2026-10-18",
    "raw": 13,
    "rawUnit": "box"
  },
  {
    "id": "6-arctic-shrimp",
    "name": "Arctic shrimp",
    "category": "Seafood",
    "cooked": 1,
    "prepUnit": "kg",
    "useBy": "2026-10-13",
    "raw": 2,
    "rawUnit": "box"
  },
  {
    "id": "7-crab-meat",
    "name": "Crab meat",
    "category": "Seafood",
    "cooked": 2,
    "prepUnit": "box",
    "useBy": "",
    "raw": 10,
    "rawUnit": "box"
  },
  {
    "id": "8-shell-off-prawn",
    "name": "Shell-off prawn",
    "category": "Seafood",
    "cooked": 5,
    "prepUnit": "bag",
    "useBy": "",
    "raw": 12,
    "rawUnit": "box"
  },
  {
    "id": "21-sirloin-steak",
    "name": "Sirloin steak",
    "category": "Meat",
    "cooked": 22,
    "prepUnit": "pcs",
    "useBy": "2026-10-10",
    "raw": 70,
    "rawUnit": "kg"
  },
  {
    "id": "19-ribeye-steak",
    "name": "Ribeye steak",
    "category": "Meat",
    "cooked": 6,
    "prepUnit": "portion",
    "useBy": "2026-10-20",
    "raw": 20,
    "rawUnit": "kg"
  },
  {
    "id": "20-fillet-steak",
    "name": "Fillet steak",
    "category": "Meat",
    "cooked": 13,
    "prepUnit": "portion",
    "useBy": "2026-10-09",
    "raw": 10,
    "rawUnit": "kg"
  },
  {
    "id": "22-lamb-chops",
    "name": "Lamb chops",
    "category": "Meat",
    "cooked": 8,
    "prepUnit": "portion",
    "useBy": "2026-09-27",
    "raw": 0,
    "rawUnit": "portion"
  },
  {
    "id": "23-chicken-fillet",
    "name": "Chicken fillet",
    "category": "Meat",
    "cooked": 0,
    "prepUnit": "bag",
    "useBy": "",
    "raw": 1,
    "rawUnit": "bag"
  },
  {
    "id": "24-minced-beef",
    "name": "Minced beef",
    "category": "Meat",
    "cooked": "",
    "prepUnit": "kg",
    "useBy": "",
    "raw": 9,
    "rawUnit": "box"
  },
  {
    "id": "25-salad",
    "name": "Salad",
    "category": "Veg & Sides",
    "cooked": 2,
    "prepUnit": "box",
    "useBy": "2026-10-20",
    "raw": 0,
    "rawUnit": "box"
  },
  {
    "id": "26-broccoli",
    "name": "Broccoli",
    "category": "Veg & Sides",
    "cooked": 7,
    "prepUnit": "pcs",
    "useBy": "",
    "raw": 7,
    "rawUnit": "pcs"
  },
  {
    "id": "27-lemon",
    "name": "Lemon",
    "category": "Veg & Sides",
    "cooked": 2,
    "prepUnit": "box",
    "useBy": "",
    "raw": 0,
    "rawUnit": "box"
  },
  {
    "id": "28-fries",
    "name": "Fries",
    "category": "Veg & Sides",
    "cooked": 0,
    "prepUnit": "bag",
    "useBy": "",
    "raw": 17,
    "rawUnit": "box"
  },
  {
    "id": "29-sweet-potato",
    "name": "Sweet potato",
    "category": "Veg & Sides",
    "cooked": 0,
    "prepUnit": "bag",
    "useBy": "",
    "raw": 2.5,
    "rawUnit": "box"
  },
  {
    "id": "30-tiramisu",
    "name": "Tiramisu",
    "category": "Dessert",
    "cooked": 9,
    "prepUnit": "pcs",
    "useBy": "2026-10-15",
    "raw": 2,
    "rawUnit": "box"
  },
  {
    "id": "31-vanilla-ice-cream",
    "name": "Vanilla ice cream",
    "category": "Dessert",
    "cooked": "",
    "prepUnit": "tub",
    "useBy": "",
    "raw": 0,
    "rawUnit": "tub"
  },
  {
    "id": "32-cr-me-br-l-e",
    "name": "Crème brûlée",
    "category": "Dessert",
    "cooked": 0,
    "prepUnit": "portion",
    "useBy": "",
    "raw": "",
    "rawUnit": "tray"
  },
  {
    "id": "33-flora-butter",
    "name": "Flora butter",
    "category": "Other",
    "cooked": 33,
    "prepUnit": "kg",
    "useBy": "",
    "raw": "",
    "rawUnit": "kg"
  },
  {
    "id": "34-bins-cleaning",
    "name": "Bins cleaning",
    "category": "Veg & Sides",
    "cooked": "Yes",
    "prepUnit": "pcs",
    "useBy": "",
    "raw": "",
    "rawUnit": "pcs"
  }
];
