# **🍏 怪物彈珠 \- 果實分配助手 (Monster Strike Fruit Allocator)**

這是一個專為《怪物彈珠》玩家設計的現代化網頁工具，旨在解決「果實分配複雜、庫存難以計算」的痛點。  
透過直覺的介面，玩家可以管理角色需求、盤點背包庫存，並利用雲端同步功能隨時隨地存取資料。

## **✨ 核心功能**

### **1\. ☁️ 雲端同步與多重存檔 (New\!)**

* **Firebase 整合**：支援 Google 帳號登入，資料自動同步至雲端，換裝置也能無縫接軌。  
* **多重存檔槽位**：提供 **5 個獨立存檔**（Slot 1 \~ Slot 5），可針對不同帳號（本帳/小號）或不同用途分別管理。  
* **離線備援**：若無網路或未登入，系統自動切換至 LocalStorage 模式，確保資料不遺失。  
* **手動備份**：支援匯出/匯入 JSON 檔案，資料掌握在自己手中。

### **2\. 🎒 智慧庫存管理**

* **英雄 BANK (鳥籠)**：模擬遊戲內建的 7 個鳥籠欄位，視覺化管理。  
* **角色暫存箱 (倉庫)**：支援建立「倉庫角色」（如 4 星角），用於暫存多餘的果實。  
* **智慧計算**：  
  * **自動統計**：系統會自動加總「主力需求」與「已獲得」，並扣除「現有庫存」。  
  * **狀態燈號**：即時顯示 **充足 (✓)**、**剩餘 (+)** 或 **短缺 (-)**，補貨目標一目了然。

### **3\. 👥 角色與分配管理**

* **主力清單**：建立需要安裝果實的角色，支援搜尋與篩選。  
* **進度追蹤**：每顆果實皆有獨立 Checkbox，勾選代表「已獲得」。  
* **快速組合 (Presets)**：一鍵套用常用配置：  
  * 同族加擊全套 / 戰型加擊全套 / 擊種加擊全套  
  * 速必雙削組合 (將命/兵命/速必)  
* **智慧轉移**：提供「轉移介面」，可輕鬆將果實從 **鳥籠/倉庫** 移至 **主力角色** 身上。

### **4\. 📱 現代化 UI 設計**

* **RWD 響應式設計**：完美支援手機版，表格自動轉為卡片式佈局，操作更順手。  
* **排序與篩選**：支援依「未完成數量」排序，優先處理缺果實的角色。

## **🚀 快速開始**

### **線上使用**

直接訪問 GitHub Pages：[https://emily4027.github.io/monster-strike-fruit-assign/](https://emily4027.github.io/monster-strike-fruit-assign/)

### **本地開發**

本專案為靜態網頁，但包含 Firebase SDK 整合。

1. Clone 專案：
````markdown  
   git clone \[https://github.com/emily4027/monster-strike-fruit-assign.git\](https://github.com/emily4027/monster-strike-fruit-assign.git)
````
2. 直接使用瀏覽器開啟 ````  index.html````   即可（部分 Firebase 功能需在 HTTPS 或 localhost 環境下運作）。

## **📂 檔案結構**

````markdown  .  
├── index.html      # 主程式介面  
├── style.css       # 樣式表 (包含 Glassmorphism, RWD 設定)  
├── script.js       # 核心邏輯 (Firebase 串接, DOM 操作, 資料計算)  
├── CHANGELOG.md    # 更新日誌  
└── README.md       # 專案說明
````
## **🛠 技術堆疊**

* **Frontend**: HTML5, CSS3 (Variables, Flexbox/Grid), Vanilla JavaScript (ES6+)  
* **Backend (Baas)**: Google Firebase (Authentication, Firestore)  
* **Storage**: LocalStorage (離線 fallback)  
* **Fonts**: Google Fonts (Noto Sans TC)

## **📝 授權與備註**

* 本專案為非官方粉絲製作工具，與 MIXI 無直接關聯。  
* 部分程式碼與邏輯由 AI 協助生成與優化。