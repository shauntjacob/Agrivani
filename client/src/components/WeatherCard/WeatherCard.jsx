import { DEFAULT_LOCATION } from "../../lib/config";
import { Cloud, CloudRain, Sun, Wind, Droplets, ChevronRight, Zap } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './WeatherCard.css';

const WeatherCard = () => {
    const { language } = useLanguage();
    const [weather, setWeather] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchWeather = async () => {
            try {
                const response = await fetch(
                    `https://api.openweathermap.org/data/2.5/weather?lat=${DEFAULT_LOCATION.lat}&lon=${DEFAULT_LOCATION.lon}&units=metric&appid=${import.meta.env.VITE_OPENWEATHER_API_KEY}`
                );
                const data = await response.json();
                setWeather(data);
                setLoading(false);
            } catch (err) {
                console.error(err);
                setLoading(false);
            }
        };
        fetchWeather();
    }, []);

    const getAgriAdvisory = (data) => {
        if (!data) return null;
        const temp = data.main.temp;
        const humidity = data.main.humidity;
        const windKmH = data.wind.speed * 3.6;
        const main = data.weather[0].main.toLowerCase();

        const advice = {
            en: {
                rain: { text: "Rain Alert: Natural irrigation incoming. Secure crops.", color: "#ef4444" },
                heat: { text: "Heat Alert: High temperature. Periodic irrigation needed.", color: "#f97316" },
                wind: { text: "Wind Alert: High wind. Postpone pesticide sprays.", color: "#f59e0b" },
                good: { text: "Optimal Conditions: Perfect for sowing or weeding.", color: "#22c55e" }
            },
            mr: {
                rain: { text: "पाऊस इशारा: नैसर्गिक सिंचन सुरू. पीक सुरक्षित करा.", color: "#ef4444" },
                heat: { text: "उष्णतेचा इशारा: तापमान जास्त आहे. सिंचनाची गरज आहे.", color: "#f97316" },
                wind: { text: "वाऱ्याचा इशारा: वेगाने वारा. फवारणी पुढे ढकला.", color: "#f59e0b" },
                good: { text: "उत्तम स्थिती: पेरणी किंवा निंदणीसाठी योग्य वेळ.", color: "#22c55e" }
            }
        };

        const langSet = language === 'mr-IN' ? advice.mr : advice.en;
        if (main.includes('rain')) return langSet.rain;
        if (temp > 35) return langSet.heat;
        if (windKmH > 18) return langSet.wind;
        return langSet.good;
    };

    if (loading || !weather) return null;

    const advisory = getAgriAdvisory(weather);

    return (
        <div className="weather-card-kpi soft-card elevation-hover" onClick={() => window.dispatchEvent(new CustomEvent('setChatInput', { detail: advisory.text }))}>
            <div className="weather-kpi-icon" style={{ backgroundColor: advisory.color + '20' }}>
                <Zap size={20} style={{ color: advisory.color }} />
            </div>
            <div className="weather-kpi-content">
                <span className="weather-kpi-label">{language === 'mr-IN' ? 'कृषी सल्ला' : 'Agri Advisory'}</span>
                <span className="weather-kpi-text">{advisory.text}</span>
            </div>
            <ChevronRight size={16} className="weather-kpi-arrow" />
        </div>
    );
};

export default WeatherCard;
