# 🌾 Kisan Setu

### Digital Access to Agricultural Procurement Infrastructure

**Kisan Setu** is a modern, map-based web platform that simplifies the discovery of agricultural procurement centres across India. It brings location intelligence and structured procurement-centre information together in a single, accessible interface.

The platform enables users to explore procurement centres on an interactive map, view centre-specific information, and quickly understand their operational status, supported crops, capacity, contact details, and working hours.

---

## 📌 Overview

Access to reliable information about agricultural procurement infrastructure is essential for farmers and other stakeholders involved in the agricultural supply chain.

However, procurement-centre information can be difficult to discover, fragmented across sources, or presented without a convenient geographic interface.

**Kisan Setu addresses this gap by providing a centralized digital layer for procurement-centre discovery.**

The current application combines:

* Interactive geospatial visualization
* Structured procurement-centre data
* Operational status indicators
* Centre-specific information
* Responsive and accessible user experience

The architecture is intentionally lightweight and extensible, allowing the platform to evolve toward a larger agricultural information and decision-support system.

---

## 🎯 Problem Statement

Agricultural procurement infrastructure is geographically distributed, while information about it is often difficult for users to locate and interpret.

Users may need to know:

* Where procurement centres are located
* Which centres are operational
* What crops a centre accepts
* What procurement capacity is available
* How to contact a centre
* When a centre operates

Kisan Setu provides a **single visual interface** to make this information easier to discover and understand.

---

## 💡 Solution

Kisan Setu transforms structured procurement-centre data into an intuitive geographic experience.

Instead of navigating through disconnected information sources, users can:

**Explore → Locate → Inspect → Compare → Act**

through a single interface.

### Core Experience

```text
                    KISAN SETU
                        │
             ┌──────────┴──────────┐
             │                     │
        Interactive Map       Centre Directory
             │                     │
             └──────────┬──────────┘
                        │
                Centre Information
                        │
        ┌───────────────┼───────────────┐
        │               │               │
     Location         Status          Capacity
        │               │               │
      Crops          Contact          Hours
```

---

# ✨ Key Capabilities

## 🗺️ Interactive Geospatial Map

Kisan Setu uses **Leaflet** to provide an interactive map for visualizing procurement centres.

Users can:

* Explore centre locations geographically
* Identify procurement centres through map markers
* Open detailed centre information
* Distinguish operational status visually

### Status Visualization

| Status   | Indicator | Meaning                      |
| -------- | --------- | ---------------------------- |
| Active   | 🟢        | Centre is operational        |
| Inactive | 🔴        | Centre is currently inactive |

---

## 🏢 Procurement Centre Directory

In addition to the map, Kisan Setu presents procurement centres as structured information cards.

Each centre can contain:

| Information     | Description                             |
| --------------- | --------------------------------------- |
| Centre Name     | Official name of the procurement centre |
| Address         | Physical location                       |
| Coordinates     | Latitude and longitude                  |
| Contact         | Telephone contact                       |
| Email           | Centre email address                    |
| Operating Hours | Centre working schedule                 |
| Crops           | Supported crop categories               |
| Capacity        | Procurement capacity                    |
| Status          | Current operational state               |

---

## 📊 Structured Data Layer

Procurement-centre information is maintained in a structured JSON dataset:

```text
src/data/procurement-centres.json
```

This approach keeps the initial application simple while providing a clear path toward future API or database integration.

The data model currently supports:

```json
{
  "id": "pc-001",
  "name": "Centre Name",
  "address": "Full Address",
  "coordinates": {
    "lat": 28.7041,
    "lng": 77.1025
  },
  "contact": "+91-XXXXXXXXXX",
  "email": "contact@example.com",
  "hours": "Mon-Sat: 9:00 AM - 5:00 PM",
  "crops": [
    "Wheat",
    "Rice"
  ],
  "capacity": "5000 MT",
  "status": "active"
}
```

---

# 🧩 System Architecture

The current application follows a lightweight frontend architecture.

```text
┌───────────────────────────────────────────┐
│                 Kisan Setu                │
│                Web Interface              │
└─────────────────────┬─────────────────────┘
                      │
                      ▼
┌───────────────────────────────────────────┐
│                 Astro                     │
│          Application / Components         │
└───────────────┬───────────────┬───────────┘
                │               │
                ▼               ▼
      ┌────────────────┐  ┌────────────────┐
      │  Centre Data   │  │ ProcurementMap │
      │     JSON       │  │    Leaflet     │
      └────────────────┘  └────────────────┘
                │               │
                └───────┬───────┘
                        ▼
              ┌──────────────────┐
              │    User / Map    │
              │    Experience    │
              └──────────────────┘
```

### Current Architecture

* **Astro** — application framework
* **TypeScript** — development language
* **Leaflet** — geospatial visualization
* **JSON** — data source
* **Vanilla CSS** — styling and responsive design

This architecture provides a clean foundation for migrating the data layer to an API/database when the platform scales.

---

# 🛠️ Technology Stack

| Layer                | Technology        |
| -------------------- | ----------------- |
| Frontend Framework   | Astro 7.x         |
| Programming Language | TypeScript        |
| Mapping              | Leaflet 1.9.x     |
| Styling              | Vanilla CSS       |
| Data Layer           | JSON              |
| Runtime              | Node.js ≥ 22.12.0 |
| Package Manager      | npm               |

---

# 📁 Project Structure

```text
kisan-setu/
│
├── public/
│   ├── favicon.ico
│   └── favicon.svg
│
├── src/
│   │
│   ├── assets/
│   │   ├── astro.svg
│   │   └── background.svg
│   │
│   ├── components/
│   │   ├── ProcurementMap.astro
│   │   └── Welcome.astro
│   │
│   ├── data/
│   │   └── procurement-centres.json
│   │
│   ├── layouts/
│   │   └── Layout.astro
│   │
│   └── pages/
│       └── index.astro
│
├── astro.config.mjs
├── package.json
├── package-lock.json
├── tsconfig.json
└── README.md
```

---

# 🚀 Getting Started

## Prerequisites

Ensure the following are installed:

* Node.js **22.12.0 or higher**
* npm

Verify your installation:

```bash
node --version
npm --version
```

---

## Installation

Clone the repository:

```bash
git clone <repository-url>
```

Navigate to the project:

```bash
cd kisan-setu
```

Install dependencies:

```bash
npm install
```

---

## Development

Start the local development server:

```bash
npm run dev
```

The application will be available at:

```text
http://localhost:4321
```

---

## Production Build

Generate an optimized production build:

```bash
npm run build
```

The resulting files are generated in:

```text
dist/
```

---

## Preview Production Build

```bash
npm run preview
```

---

# 📦 NPM Scripts

| Command           | Purpose                      |
| ----------------- | ---------------------------- |
| `npm install`     | Install project dependencies |
| `npm run dev`     | Start development server     |
| `npm run build`   | Generate production build    |
| `npm run preview` | Preview production build     |
| `npm run astro`   | Access Astro CLI             |

---

# 🗂️ Managing Procurement Data

Procurement-centre records are maintained in:

```text
src/data/procurement-centres.json
```

To add a centre:

1. Open the JSON dataset.
2. Add a new centre object.
3. Provide accurate geographic coordinates.
4. Add the relevant crop and capacity information.
5. Specify the current status.
6. Run the production build to validate the application.

Example:

```json
{
  "id": "pc-007",
  "name": "Example Procurement Centre",
  "address": "Example District, Assam",
  "coordinates": {
    "lat": 26.1445,
    "lng": 91.7362
  },
  "contact": "+91-XXXXXXXXXX",
  "email": "centre@example.com",
  "hours": "Mon-Sat: 9:00 AM - 5:00 PM",
  "crops": [
    "Rice",
    "Wheat"
  ],
  "capacity": "5000 MT",
  "status": "active"
}
```

> **Data accuracy:** Geographic coordinates, contact details, operating status, and procurement information should be verified against authoritative sources before being used for operational decisions.

---

# ♿ Accessibility & Responsive Design

Kisan Setu is designed with accessibility and cross-device usability in mind.

The interface incorporates:

* Semantic HTML
* ARIA labels
* Keyboard-accessible interactions
* Responsive layouts
* Mobile-first design principles
* Screen-size adaptations

The application is intended to work across smartphones, tablets, laptops, and desktop systems.

---

# 🔐 Data Considerations

The current version uses a local JSON dataset for demonstration and application functionality.

For a production-scale deployment, the data layer can be migrated to a centralized backend with:

* Authentication and authorization
* Database-backed records
* Data validation
* Audit history
* Source attribution
* Administrative management
* Automated updates
* API access

This would allow procurement information to be maintained independently from the frontend application.

---

# 🔮 Roadmap

Kisan Setu is designed to evolve beyond a basic procurement-centre locator.

### Phase 1 — Foundation

* [x] Interactive procurement map
* [x] Procurement-centre directory
* [x] Centre details
* [x] Operational status visualization
* [x] Responsive interface
* [x] Structured data model

### Phase 2 — Discovery

* [ ] Search by location
* [ ] State and district filters
* [ ] Crop-based filtering
* [ ] Capacity filtering
* [ ] Distance-based discovery
* [ ] Current-location support

### Phase 3 — Data Intelligence

* [ ] Centralized database
* [ ] Government/open-data integration
* [ ] Data validation and provenance
* [ ] Automated data updates
* [ ] Historical procurement data

### Phase 4 — Analytics & GIS

* [ ] Procurement analytics dashboard
* [ ] Regional capacity analysis
* [ ] Crop-wise analytics
* [ ] Administrative boundary layers
* [ ] Agricultural land datasets
* [ ] Advanced spatial analysis

### Phase 5 — AI Assistance

* [ ] Natural-language search
* [ ] AI-powered procurement assistant
* [ ] Intelligent centre recommendations
* [ ] Conversational GIS queries
* [ ] Data-driven insights for researchers and policymakers

---

# 🌐 Future Platform Architecture

As Kisan Setu grows, the architecture can evolve from a static data-driven application into a full digital platform:

```text
                    ┌─────────────────┐
                    │    Kisan Setu   │
                    │    Web Client   │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     API Layer   │
                    └────────┬────────┘
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
        ┌──────────┐   ┌──────────┐   ┌────────────┐
        │ Database │   │ GIS Data │   │ AI Engine  │
        └──────────┘   └──────────┘   └────────────┘
              │              │              │
              └──────────────┼──────────────┘
                             ▼
                    ┌─────────────────┐
                    │ Insights & Data │
                    │    Services     │
                    └─────────────────┘
```

This architecture could support farmers, researchers, government departments, GIS professionals, and administrators through a common data platform.

---

# 🎯 Potential Impact

Kisan Setu can help establish a more accessible and data-driven agricultural information ecosystem.

### For Farmers

* Easier discovery of procurement centres
* Better access to centre information
* Geographic understanding of nearby infrastructure

### For Researchers

* Structured procurement infrastructure data
* Geographic visualization
* Potential foundation for agricultural research

### For Policymakers

* Regional infrastructure visibility
* Potential capacity analysis
* Data-driven planning opportunities

### For Government & Administrators

* Centralized infrastructure representation
* Potential data management capabilities
* Foundation for future monitoring and analytics

---

# 🤝 Contributing

Contributions are welcome.

Create a feature branch:

```bash
git checkout -b feature/your-feature
```

Make your changes and test them locally:

```bash
npm run build
```

Then submit a pull request with a clear description of:

* The problem addressed
* Proposed solution
* Technical implementation
* Expected impact

---

# 📄 License

This project is licensed under the **MIT License**.

---

# 🌾 Kisan Setu

### **Bridging Farmers, Infrastructure & Information**

Kisan Setu is built with the vision of making agricultural procurement infrastructure **more discoverable, transparent, accessible, and data-driven**.

> **“Where information connects, opportunity grows.”**

---

### Built With

**Astro · TypeScript · Leaflet · Open Data Principles**
