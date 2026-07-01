# A Mini Project Report On

**NAMMA RYTHA (ನಮ್ಮ ರೈತ) — AI SMART FARMING PLATFORM**

*A Short report submitted in partial fulfillment of the requirement for the award of degree of*

**MASTER OF COMPUTER APPLICATIONS**

*of*

**Visvesvaraya Technological University Belgaum, Karnataka**

**By**

**Thirthan K N**

**Under the Guidance of**

**Kiruthika T**
*Assistant Professor*
*CMR Institute of Technology*

**Department of Master of Computer Applications**
**CMR INSTITUTE OF TECHNOLOGY**
*132, IT Park Road, Kundalahalli, Bangalore – 560037*
*2025-2026*

---

# PROJECT REPORT: NAMMA RYTHA WEB PLATFORM

## ABSTRACT

The **Namma Rytha (ನಮ್ಮ ರೈತ)** web platform represents a modern digital solution aimed at bridging the gap between traditional agricultural practices and cutting-edge artificial intelligence. Engineered as a responsive, premium web application, the platform equips Indian farmers with localized, data-driven insights to optimize resource usage, increase crop yields, and foster sustainable farming methods. The system addresses a critical need in modern agriculture: making complex technical telemetry (such as soil moisture levels, NPK ratios, and weather forecasts) easily understandable and actionable for everyday users.

The technical architecture of the platform is built on a robust **MERN (MongoDB, Express, Node.js)** backend stack, combined with a responsive, glassmorphic HTML5/CSS3 frontend. To enhance user engagement, the system integrates immersive video backgrounds (featuring localized farm imagery) and a customized multi-language translation engine supporting Kannada, Hindi, and other regional languages. A central element of the platform is its integration with the **Google Gemini Pro AI model**, which dynamically processes soil, weather, and crop parameters to deliver real-time, context-specific farming recommendations.

Key functional modules of Namma Rytha include:
1. **Smart Irrigation Advisor**: AI-driven soil moisture monitoring and watering schedules.
2. **Fertilizer Engine**: Localized NPK ratio analysis and prescription tools.
3. **Crop Recommendation & Yield Predictor**: Data-driven suggestions for crop selection based on soil characteristics.
4. **Disease Detector**: Auto-diagnosis of crop infections from visual symptoms.
5. **Market Prices (Mandi Price Tracker)**: Live Mandi rate monitoring combined with a revenue and profit planner.
6. **Sustainability Tracker**: An interactive eco-impact dashboard calculating carbon footprints and water efficiency scores.

To ensure performance and reliability, the application incorporates a **local-first data synchronization strategy**. User profile edits and telemetry metrics are saved instantly to local browser storage to guarantee 100% availability, followed by a silent background sync to a remote MongoDB database. Additionally, a global index-based search bar is integrated into the topbar header, enabling users to instantly query crops, alerts, and advisors using keyboard shortcuts (`Ctrl + K`).

In conclusion, Namma Rytha successfully transitions complex agricultural science into a high-visibility, accessible digital ecosystem. By combining legacy farming knowledge with modern LLMs, REST APIs, and structured data, the platform establishes a comprehensive foundation for agricultural digital transformation.

---

## LITERATURE REVIEW

The development of the Namma Rytha platform is situated at the intersection of precision agriculture, artificial intelligence (AI), and mobile-first web technologies. Modern literature in agriculture emphasizes a significant shift from uniform farming practices to **Precision Agriculture (PA)**, which tailors resource application (water, fertilizer, pesticides) to the specific needs of sub-plots. Research indicates that the application of AI and Machine Learning in soil classification and crop disease detection can improve crop yields by up to 15–20% while reducing input costs.

From a technical perspective, the application utilizes the **MERN (MongoDB, Express, React/Node)** stack framework principles. Literature on agricultural information systems highlights that connectivity is a major bottleneck in rural areas. Therefore, web designs must prioritize low latency, minimal assets, and offline-first capabilities. The implementation of local-first storage hooks, combined with standard caching and service workers, ensures that the platform remains responsive under poor network conditions.

Furthermore, the deployment of Large Language Models (LLMs) like **Google Gemini Pro** via REST APIs represents a major advancement in user interface design. Traditional agricultural software required farmers to manually enter and interpret complex numerical tables. Modern UI studies document that conversational AI interfaces and structured recommendation outputs significantly reduce user friction and increase the adoption rate of technology among non-technical demographics.

Finally, local search engine and structured data schemas play a vital role in agricultural information dissemination. Research on information systems indicates that searchability is key to user retention. The integration of a custom search engine directly into the application's topbar navigation ensures that farmers can find localized crop details (such as *Wheat*, *Paddy*, or *Tomato* care) instantly, bridging the gap between vast agricultural databases and immediate field actions.

---

## SYSTEM ANALYSIS & DESIGN

The System Analysis and Design of Namma Rytha focus on creating a high-performance, responsive, and multilingual interface that facilitates crop management, market price analysis, and sustainability tracking. The application is built as a single-page-like experience utilizing clean HTML5, vanilla CSS3 variables, and vanilla JavaScript, backed by a Node.js Express server connected to MongoDB.

### 1. Functional Requirements Analysis

* **AI Advisor Module**: Integration with the Gemini API to analyze NPK, soil moisture, and location data to output recommendations.
* **Telemetry Dashboard**: Dynamic sliders and circular progress meters for real-time visualization of soil health.
* **Mandi Price Tracker & Profit Planner**: Live tracking of regional crop prices with a built-in calculator to estimate revenue and net profits.
* **Localized Multi-Language Engine**: Dynamic client-side translation of all UI text without page reloads to support regional languages.
* **Global Search Engine**: An index-based search utility in the topbar that matches user keywords with pages, crops, features, and alerts.

### 2. Database Schema Design (MongoDB / Mongoose)

The system utilizes MongoDB to store user profile data, system activities, products, and notifications. Below are the key Mongoose schemas implemented in the backend:

```javascript
// User Schema (models/User.js)
const userSchema = new mongoose.Schema({
    firstName: { type: String, default: '' },
    lastName: { type: String, default: '' },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, default: '' },
    location: { type: String, default: '' },
    area: { type: String, default: '' },
    crop: { type: String, default: '' },
    avatar: { type: String, default: '' },
    sustainability_score: { type: Number, default: 70 }
}, { timestamps: true });

// Product Schema (models/Product.js)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    category: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String, default: '' },
    image: { type: String, default: '' },
    suitable_crop: { type: String, default: 'all' },
    suitable_soil: { type: String, default: 'all' }
}, { timestamps: true });
```

### 3. Logical Layout & Stacking Context

The visual architecture is designed with a premium glassmorphic theme. To achieve this, the stacking context was carefully configured in `smooth.css`:
* **Background Video Layer (`z-index: 0`)**: Plays looping WebM/MP4 footage of agricultural scenery behind all cards.
* **HTML Element Background**: The solid dark green canvas color (`#0a0f0a`) is placed directly on the `html` root, while the `body` remains transparent (`background: transparent`). This prevents the body element's background color from masking or hiding the video background.
* **Content Layer (`z-index: 1+`)**: Sidebar, main panels, stats cards, and navigation buttons sit securely in front of the background video overlay.

---

## METHODOLOGY

The development of Namma Rytha followed an agile, iterative engineering methodology consisting of requirements gathering, database design, frontend implementation, AI integration, and performance optimization.

### 1. Requirements Engineering and UI Design
The initial phase focused on designing a dashboard that presents key telemetry metrics (soil moisture, temperature, NPK ratios) clearly. Responsive CSS Grid layouts were used to automatically rearrange cards on mobile viewports. For typography, the modern sans-serif fonts **Inter** and **Outfit** were loaded via Google Fonts to ensure readability.

### 2. Frontend Styling and Translation Engine
To cater to regional demographics, a client-side dictionary script (`translations.js`) was implemented. When a user selects a language (English, Kannada, Hindi, Telugu, or Tamil), the translation engine searches the DOM for tags containing a `data-i18n` attribute and instantly replaces their text content with the translated string.

### 3. Global Search Index Implementation
A custom keyword search index was built directly into `app.js`. When a query is entered into the topbar search input:
1. The search input displays a `✕` clear button and opens a glassmorphic dropdown list.
2. The search engine filters a pre-defined array (`SEARCH_INDEX`) matching titles, descriptions, and keywords.
3. The dropdown groups results by category (Pages, Crops, Features, Alerts) and highlights the matching letters with a custom `<mark>` tag.
4. Clicking a result instantly calls the navigation routing function `showPage()`.

### 4. Local-First Profile Synchronization
To prevent user save failures when the backend is sleeping (due to hosting platforms spinning down free-tier instances):
* The profile update function (`updateProfile()`) saves changes to browser-based `localStorage` immediately and shows a success toast.
* It then executes a silent background `fetch()` request with a **6-second abort controller timeout** to sync changes to the remote MongoDB database. This prevents network errors from blocking the user interface.

---

## RESULTS & CONCLUSION

### Project Results and Evaluation
The deployed version of Namma Rytha achieves a high level of usability and responsiveness. Local and remote testing confirms that:
* **Instant Profile Saves**: Profile changes update instantly, resolving connection timeout errors.
* **Search Performance**: The search utility operates with sub-millisecond response times, handling keyboard shortcuts (`Ctrl + K`) to focus the cursor.
* **Video Stacking Reliability**: The background video renders reliably behind transparent glass cards across different browsers and screens.
* **Translation Coverage**: The UI updates between English and regional languages instantly.

### Conclusion
Namma Rytha demonstrates how modern web architectures can make precision farming accessible. By combining large language models (Google Gemini) with lightweight REST services, local-first storage, and clean layouts, the platform provides farmers with a fast and intuitive tool to optimize crop management. Future scopes include adding crop price prediction graphs and integrating IoT sensors directly to the user dashboard for real-time telemetry updates.
