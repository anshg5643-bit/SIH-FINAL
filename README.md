# StressMitra

## AI-Based Predictive Personnel Stress & Welfare Monitoring System

**StressMitra** is an AI-powered personnel wellness and early-warning platform designed for **CAPFs, Armed Forces, Police, and other uniformed organizations**.

The platform analyzes voluntary wellness check-ins and relevant organizational indicators such as **duty hours, sleep, workload, leave patterns, fatigue, and recovery gaps** to identify patterns associated with stress and fatigue.

StressMitra provides **risk assessment, trend analysis, contributing-factor insights, and welfare-support workflows** for authorized personnel.

> **Predict Early. Intervene Responsibly. Support Personnel.**

---

## 🚀 Live Demo

### [Launch StressMitra](https://sih-final-lb0p.onrender.com/)

StressMitra is deployed on **Render** as a working web prototype.

**Live Application:**
https://sih-final-lb0p.onrender.com/

---

## 🎯 Problem Statement

Personnel working in uniformed services may experience demanding duty schedules, irregular sleep, workload pressure, frequent deployments, transfers, prolonged periods away from family, and limited recovery opportunities.

These factors can contribute to stress, fatigue, reduced well-being, and burnout.

Traditional welfare mechanisms may not always provide an early indication of changing personnel wellness patterns.

**StressMitra addresses this gap by providing an AI-assisted early-warning and welfare-support platform that can help authorized welfare personnel identify concerning patterns and facilitate timely supportive interventions.**

---

## 💡 Our Solution

StressMitra combines **secure wellness data collection, data processing, Machine Learning, risk assessment, analytics, and welfare intervention tracking** into a single platform.

The system can:

* Collect voluntary personnel wellness check-ins
* Analyze workload, sleep, duty and recovery indicators
* Identify patterns associated with stress and fatigue
* Generate **Low / Medium / High risk assessments**
* Display risk trends and distributions
* Identify important contributing factors
* Provide welfare-oriented recommendations
* Track interventions and follow-ups
* Provide role-specific dashboards
* Generate welfare reports

StressMitra is designed as an **early-warning and decision-support system**, rather than a medical diagnostic or disciplinary system.

---

# 🧠 AI / Machine Learning

StressMitra uses a **Random Forest classifier** to analyze personnel wellness and workload indicators.

### ML Workflow

```text
Personnel Wellness Data
          ↓
Data Validation
          ↓
Data Preprocessing
          ↓
Feature Engineering
          ↓
Random Forest Classifier
          ↓
Risk Assessment
          ↓
Low / Medium / High Risk
          ↓
Contributing Factors
          ↓
Welfare Recommendations
          ↓
Intervention & Follow-up
```

### Key Indicators

The prototype considers indicators such as:

* Duty hours
* Sleep duration
* Workload
* Fatigue
* Mood
* Focus
* Social support
* Recovery gap
* Leave patterns
* Deployment-related trends

### Model

**Algorithm:** Random Forest Classifier

The model is used to identify patterns in the available indicators and classify personnel into different risk levels.

> **Important:** The current prototype uses demonstration/synthetic data for development and testing. Its model performance should not be interpreted as clinically or operationally validated evidence.

---

# 👥 Role-Based Platform

## 👤 Personnel Dashboard

Personnel can:

* Create an account
* Complete wellness check-ins
* Enter duty and workload information
* Record sleep and recovery indicators
* View personal wellness trends
* Access supportive welfare resources

---

## 🧑‍💼 Welfare Officer Dashboard

Authorized welfare officers can:

* Monitor relevant risk trends
* Review contributing factors
* Identify personnel requiring welfare attention
* Review wellness patterns
* Record welfare interventions
* Track follow-ups
* Generate welfare reports

---

## 📊 Command / Aggregate Dashboard

Authorized command-level users can access **aggregate organizational insights**, including:

* Overall risk distribution
* Risk trends
* Workload patterns
* Organizational wellness indicators
* Aggregate analytics

The architecture is designed to limit unnecessary exposure to individual-level wellness information.

---

# 🌿 Welfare & Support Features

StressMitra focuses on **supportive and preventive welfare interventions**.

Possible support workflows include:

* Counselling referral
* Workload adjustment
* Recovery support
* Welfare interventions
* Follow-up tracking
* Calm music
* Puzzles and relaxation activities
* Personalized welfare recommendations

The objective is to encourage **early support and recovery rather than punitive action**.

---

# 🔐 Privacy & Security

StressMitra follows a privacy-conscious architecture designed around controlled access to personnel wellness information.

Key considerations include:

* Role-based access control
* Separation of personnel and aggregate dashboards
* Protected application configuration
* Secure handling of credentials
* Limited access to sensitive wellness information
* Separation of API keys from source code

### Secrets

Sensitive configuration files containing API keys, OAuth credentials, and other secrets are intentionally excluded from the public GitHub repository.

The project's `config/` directory is therefore ignored through `.gitignore`.

---

# 🏗️ Technical Architecture

```text
                    STRESSMITRA
                         │
          ┌──────────────┴──────────────┐
          │                             │
     Personnel                    Authorized Users
     Check-ins                  Welfare / Command
          │                             │
          └──────────────┬──────────────┘
                         ↓
                Secure Data Collection
                         ↓
                  Data Processing
                         ↓
                 Feature Engineering
                         ↓
                Random Forest Model
                         ↓
                  Risk Assessment
                         ↓
          ┌──────────────┼──────────────┐
          ↓              ↓              ↓
        LOW           MEDIUM           HIGH
          │              │              │
          └──────────────┼──────────────┘
                         ↓
                Trend & Analytics
                         ↓
             Contributing Factors
                         ↓
             Welfare Recommendations
                         ↓
              Intervention Tracking
```

---

# 🛠️ Technology Stack

### Backend

* **Python**
* **FastAPI**
* **Uvicorn**

### AI / Machine Learning

* **Scikit-learn**
* **Random Forest**
* **NumPy**
* **Pandas**
* **Joblib**

### Frontend

* **HTML**
* **CSS**
* **JavaScript**

### Deployment

* **Render**

### Development & Version Control

* **Git**
* **GitHub**
* **VS Code**

---

# 📁 Project Structure

```text
SIH-FINAL/
│
├── app/
│   ├── main.py
│   ├── routes/
│   └── ...
│
├── models/
│   └── stress_model.joblib
│
├── scripts/
│   └── train_model.py
│
├── static/
│
├── templates/
│
├── requirements.txt
├── .gitignore
└── README.md
```

### Configuration

Sensitive configuration files are stored locally and excluded from GitHub:

```text
config/
```

This prevents API keys and private credentials from being committed to the public repository.

---

# ⚙️ Run Locally

### 1. Clone the repository

```bash
git clone https://github.com/anshg5643-bit/SIH-FINAL.git
cd SIH-FINAL
```

### 2. Create a virtual environment

```bash
python -m venv venv
```

### 3. Activate the environment

**Windows:**

```powershell
venv\Scripts\activate
```

### 4. Install dependencies

```bash
pip install -r requirements.txt
```

### 5. Configure required secrets

Keep API keys and other credentials in your local configuration/environment settings.

**Do not commit secrets to GitHub.**

### 6. Start the FastAPI server

```bash
uvicorn app.main:app --reload
```

### 7. Open the application

```text
http://127.0.0.1:8000
```

---

# ☁️ Deployment

StressMitra is deployed using **Render**.

### Production URL

**https://sih-final-lb0p.onrender.com/**

The deployment runs the FastAPI application with the project's Python dependencies.

For production environments, sensitive credentials should be configured using secure environment/deployment settings rather than being stored in the GitHub repository.

---

# 📈 Future Scope

Potential future development areas include:

* Integration with institutional HR/welfare systems through secure APIs
* Larger and ethically collected real-world datasets
* Improved model validation with domain experts
* Explainable AI for welfare officers
* More advanced longitudinal trend analysis
* Secure institutional deployment
* Multilingual support
* Advanced anonymized organizational analytics
* Integration with approved counselling and welfare workflows

Any real-world implementation would require appropriate **privacy safeguards, ethical review, domain validation, security controls, and institutional approval**.

---

# 🏆 Smart India Hackathon

### Project Information

**Project:** StressMitra
**Idea ID:** 26186
**Category:** Software
**Theme:** MedTech / BioTech / HealthTech

StressMitra was developed as a student prototype for **Smart India Hackathon 2026**, exploring an AI-assisted approach to personnel welfare and early stress-risk identification.

The project focuses on combining **AI/ML, web technologies, data analytics, and welfare-support workflows** into a unified platform.

---

# 📚 Research & References

The project is informed by research and publicly available information related to:

* Occupational stress
* Personnel welfare
* Mental health and well-being in uniformed services
* Sleep and workload-related fatigue
* Preventive welfare interventions
* Machine Learning-based risk assessment
* Organizational wellness monitoring

Research findings should always be evaluated using their original sources and appropriate domain expertise before being used for medical, operational, or institutional decisions.

---

# 🎥 Project Demonstration

A complete demonstration and explanation of the StressMitra prototype is available on YouTube:

**Project Video:**
https://www.youtube.com/watch?v=dhXkXL7luhU

---

# 🔗 Project Links

| Resource                 | Link                                        |
| ------------------------ | ------------------------------------------- |
| 🌐 **Live Demo**         | https://sih-final-lb0p.onrender.com/        |
| 💻 **GitHub Repository** | https://github.com/anshg5643-bit/SIH-FINAL  |
| 🎥 **Project Video**     | https://www.youtube.com/watch?v=dhXkXL7luhU |

---

# 👨‍💻 Development

StressMitra was developed as a collaborative student project with a focus on:

**Artificial Intelligence • Machine Learning • FastAPI • Web Development • Data Processing • Personnel Welfare • Responsible Technology**

---

# ⚠️ Disclaimer

StressMitra is a **prototype decision-support and welfare platform**.

It does **not** provide medical diagnoses, psychological diagnoses, or definitive assessments of an individual's mental health.

The current Machine Learning prototype uses demonstration/synthetic data and should not be treated as clinically or operationally validated.

Before any real-world deployment, the system would require appropriate:

* Real-world data validation
* Domain-expert evaluation
* Ethical review
* Privacy safeguards
* Security assessment
* Institutional approval
* Model validation and monitoring

StressMitra is intended to **support human welfare decisions, not replace qualified professionals or institutional judgment**.

---

## ⭐ StressMitra

**Predict Early. Intervene Responsibly. Support Personnel.**
