import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const resources = {
  en: {
    translation: {
      sidebar: {
        dashboard: "Dashboard",
        inventory: "Inventory",
        sales: "Daily Sales",
        reports: "Reports",
        logout: "Logout System"
      },
      header: {
        ownerPortal: "Welcome Owner..",
        activeSession: "Active Session",
        brandName: "Elixir Store"
      }
    }
  },
  hi: {
    translation: {
      sidebar: {
        dashboard: "डैशबोर्ड",
        inventory: "स्टॉक / इन्वेंटरी",
        sales: "दैनिक बिक्री",
        reports: "रिपोर्ट्स",
        logout: "लॉगआउट करें"
      },
      header: {
        ownerPortal: "मालिक, आपका स्वागत है..",
        activeSession: "सक्रिय सत्र",
        brandName: "एलिक्सिर स्टोर"
      }
    }
  },
  mr: {
    translation: {
      sidebar: {
        dashboard: "डॅशबोर्ड",
        inventory: "मालमत्ता / स्टॉक",
        sales: "दैनंदिन विक्री",
        reports: "अहवाल",
        logout: "लॉगआउट करा"
      },
      header: {
        ownerPortal: "मालक, आपले स्वागत आहे..",
        activeSession: "सक्रिय सत्र",
        brandName: "एलिक्सिर स्टोअर"
      }
    }
  }
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: localStorage.getItem('app_lang') || 'en', // Default language
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false 
    }
  });

export default i18n;