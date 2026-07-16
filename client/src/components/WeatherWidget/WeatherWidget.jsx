import React, { useState, useEffect, useRef } from 'react';
import './WeatherWidget.css';
import { useNavigate } from 'react-router-dom';
import { Cloud, CloudRain, Sun, Wind, Droplets, Eye, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import { useQuery } from '@tanstack/react-query';

import { DEFAULT_LOCATION } from '../../lib/config';

const WeatherWidget = () => {
  const { language } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isExpanded, setIsExpanded] = useState(false);

  // 🔹 Fetch user profile to get specific crops for the AI prompt
  const { data: profileStatus } = useQuery({
    queryKey: ["profileStatus", user?.uid],
    queryFn: () =>
      fetch(`${import.meta.env.VITE_API_URL}/api/profile/status?user_id=${user?.uid}`, {
        credentials: "include"
      }).then((res) => res.json()),
    enabled: !!user, // Only fetch if user is logged in
  });

  const userCrops = profileStatus?.profile?.crops || [];
  const cropsText = userCrops.length > 0 ? userCrops.join(', ') : (language === 'mr-IN' ? 'गहू, तांदूळ' : 'Wheat, Rice');

  // 🔹 Fetch weather using React Query for global cache access
  const { data: weather, isLoading: loading, error } = useQuery({
    queryKey: ["weather"],
    queryFn: async () => {
      let lat = DEFAULT_LOCATION.lat;
      let lon = DEFAULT_LOCATION.lon;
      try {
        const pos = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject);
        });
        lat = pos.coords.latitude;
        lon = pos.coords.longitude;
      } catch (err) {
        console.warn("Location permission denied or unavailable, using default coords.");
      }
      const API_KEY = import.meta.env.VITE_OPENWEATHER_API_KEY;
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&units=metric&appid=${API_KEY}`
      );
      if (!response.ok) throw new Error('Failed to fetch weather');
      return response.json();
    },
    staleTime: 1000 * 60 * 30, // 30 minutes
  });

  const widgetRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target)) {
        setIsExpanded(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const getWeatherIcon = (condition, size = 24) => {
    const main = condition?.toLowerCase() || '';
    if (main.includes('rain')) return <CloudRain size={size} color="#0EA5E9" />;
    if (main.includes('cloud')) return <Cloud size={size} color="#64748B" />;
    if (main.includes('clear') || main.includes('sun')) return <Sun size={size} color="#F59E0B" />;
    return <Sun size={size} color="#F59E0B" />;
  };

  const getAgriAdvisory = (item) => {
    if (!item || !item.weather || !item.weather[0]) {
      return { text: language === 'mr-IN' ? "हवामान माहिती संकलित करत आहे..." : "Gathering weather insights...", type: 'success' };
    }
    const main = item.weather[0].main.toLowerCase();
    const temp = item.main.temp;
    const humidity = item.main.humidity;
    const windKmH = item.wind.speed * 3.6;

    const advice = {
      en: {
        rain: "Rain expected. Natural irrigation for your crops. Save water today and secure your harvest.",
        highWind: "Strong winds detected. Avoid spraying pesticides or fertilizers as they may drift.",
        highHumidity: "High humidity and warmth. Monitor crops for fungal diseases or pests like blight.",
        heatwave: "Heatwave alert. Pulse-irrigate your crops and saplings to prevent wilting.",
        favorable: "Clear skies and moderate weather. Favorable for sowing, weeding, and harvesting."
      },
      mr: {
        rain: "पावसाची शक्यता आहे. आज शेताला पाणी देणे थांबवा आणि कापणी केलेले पीक सुरक्षित जागी ठेवा.",
        highWind: "वेगाने वारा वाहत आहे. कीटकनाशके किंवा खतांची फवारणी टाळा, अन्यथा ते वाऱ्याने उडून जाऊ शकतात.",
        highHumidity: "हवामानात जास्त आर्द्रता आहे. बुरशीजन्य रोग किंवा किडीचा प्रादुर्भाव होण्याची शक्यता आहे, पिकांची काळजी घ्या.",
        heatwave: "उष्णतेची लाट आहे. पिकांना सुकू नये म्हणून वेळेवर पाणी द्या.",
        favorable: "हवामान स्वच्छ आणि अनुकूल आहे. पेरणी, निंदणी किंवा कापणीसाठी ही उत्तम वेळ आहे."
      }
    };

    const langSet = language === 'mr-IN' ? advice.mr : advice.en;
    if (main.includes('rain')) return { text: langSet.rain, type: 'warning' };
    if (windKmH > 18) return { text: langSet.highWind, type: 'caution' };
    if (humidity > 80 && temp > 25) return { text: langSet.highHumidity, type: 'caution' };
    if (temp > 35) return { text: langSet.heatwave, type: 'warning' };
    return { text: langSet.favorable, type: 'success' };
  };

  const handleAIDiscuss = () => {
    const current = weather?.list[0];
    const cropClause = userCrops.length > 0
      ? (language === 'mr-IN' ? `माझ्या ${cropsText} पिकांसाठी` : `for my ${cropsText} crops`)
      : (language === 'mr-IN' ? `माझ्या पिकांसाठी (उदा. ${cropsText})` : `for my crops (e.g. ${cropsText})`);

    const prompt = language === 'mr-IN'
      ? `माझ्या भागातील हवामान सध्या ${Math.round(current.main.temp)}°C आणि ${current.weather[0].description} आहे. ${cropClause} मी कोणती काळजी घ्यावी?`
      : `The current weather here is ${Math.round(current.main.temp)}°C with ${current.weather[0].description}. What specific precautions should I take ${cropClause}?`;

    setIsExpanded(false);
    if (window.location.pathname !== '/dashboard') {
      navigate('/dashboard');
    }
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('setChatInput', { detail: prompt }));
    }, 100);
  };

  if (loading || error || !weather || !weather.list || !weather.list[0] || !weather.list[0].weather || !weather.list[0].weather[0]) return null;

  const current = weather?.list[0];
  const advisory = getAgriAdvisory(current);

  return (
    <div className={`weather-header-pill ${isExpanded ? 'active' : ''}`} ref={widgetRef}>
      <div className="pill-content" onClick={() => setIsExpanded(!isExpanded)}>
        <div className="pill-left">
          {getWeatherIcon(current?.weather?.[0]?.main, 18)}
          <span className="pill-temp">{current?.main?.temp ? Math.round(current.main.temp) : 0}°C</span>
        </div>
        <ChevronDown size={14} className={`pill-arrow ${isExpanded ? 'rotate' : ''}`} />
      </div>

      {isExpanded && (
        <div className="weather-dropdown-modal">
          <div className="dropdown-header">
            <span className="location-name">{weather?.city?.name}</span>
            <span className="condition-text">{current?.weather?.[0]?.description}</span>
          </div>

          <div className={`agri-advisory-box ${advisory?.type || 'success'}`}>
            <div className="advisory-title">
              <span>{language === 'mr-IN' ? '🌱 कृषी सल्ला' : '🌱 Agri Advisory'}</span>
              <span className={`advisory-badge ${advisory?.type || 'success'}`}>
                {(advisory?.type || 'success').toUpperCase()}
              </span>
            </div>
            <p className="advisory-text">{advisory?.text || ''}</p>
            <button className="ai-discuss-btn" onClick={handleAIDiscuss}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                <Sparkles size={16} />
                {language === 'mr-IN' ? 'AI सल्लागाराशी चर्चा करा' : 'Consult AI Expert'}
              </div>
            </button>
          </div>

          <div className="weather-details">
            <div className="detail-item">
              <Droplets size={12} /> <span>{current?.main?.humidity || 0}%</span>
            </div>
            <div className="detail-item">
              <Wind size={12} /> <span>{current?.wind?.speed ? Math.round(current.wind.speed * 3.6) : 0} km/h</span>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default WeatherWidget;