import React from 'react'
import './ExplorePage.css'
import { useLanguage } from '../../context/LanguageContext';
import { MessageSquare, Cloud, Image, Mic, Leaf, ArrowRight } from 'lucide-react';

const ExplorePage = () => {

  const { language } = useLanguage();

  const t = language === 'mr-IN' ? {
    // Hero
    heroTitle: 'एगरिवनी एक्सप्लोर करा',
    heroSub: 'कृषिसाठी तयार केलेला आपला स्मार्ट AI सहायक',
    // About
    aboutTitle: 'एगरिवनी बद्दल',
    aboutDesc: 'एगरिवनी हा एक आधुनिक कृषि चैटबॉट आहे जो भारतीय शेतकरींसाठी विशेष तयार केलेला आहे. आपला AI सहायक आपल्या शेतकरी प्रश्नांचे उत्तर देतो, हवामान अंदाज देतो आणि प्रतिमा विश्लेषण करतो.',
    // Features
    featuresTitle: 'आमच्या फीचर्स',
    featureChat: 'AI चैट',
    featureChatDesc: 'कृषिसंबंधित कोणतेही प्रश्न विचारा आणि तत्काळ उत्तर मिळा.',
    featureWeather: 'हवामान',
    featureWeatherDesc: 'आपल्या क्षेत्राचा दैनिक हवामान अंदाज पाहा.',
    featureImage: 'प्रतिमा विश्लेषण',
    featureImageDesc: 'पिकाचा फोटो अपलोड करा आणि रोग किंवा समस्या शोधा.',
    featureVoice: 'आवाज इनपुट',
    featureVoiceDesc: 'मराठी किंवा इंग्रजी मध्ये बोलून प्रश्न विचारा.',
    // Getting Started
    startTitle: 'कसे सुरू करावे',
    step1: 'नवीन चैट सुरू करा',
    step1Desc: 'डेशबोर्ड पेज वरून "नवीन चैट" बटन दाबा.',
    step2: 'प्रश्न विचारा',
    step2Desc: 'टाइप करा किंवा मिक बटन दाबून बोलायला सुरू करा.',
    step3: 'उत्तर मिळा',
    step3Desc: 'AI तुमच्या प्रश्नाचे तपशीलवार उत्तर देईल.',
    // Footer
    footerText: 'कृषी क्षेत्रात AI चा क्रांतिकारक उपयोग',
  } : {
    // Hero
    heroTitle: 'Explore AgriVani',
    heroSub: 'Your smart AI assistant built for agriculture',
    // About
    aboutTitle: 'About AgriVani',
    aboutDesc: 'AgriVani is a modern agriculture chatbot built specifically for Indian farmers. Your AI assistant answers farming questions, provides weather forecasts, and analyzes crop images to help you make better decisions.',
    // Features
    featuresTitle: 'Our Features',
    featureChat: 'AI Chat',
    featureChatDesc: 'Ask any agriculture-related question and get instant, detailed answers.',
    featureWeather: 'Weather',
    featureWeatherDesc: 'Check daily weather forecasts for your local area.',
    featureImage: 'Image Analysis',
    featureImageDesc: 'Upload a photo of your crop and detect diseases or problems.',
    featureVoice: 'Voice Input',
    featureVoiceDesc: 'Ask questions by speaking in Marathi or English.',
    // Getting Started
    startTitle: 'Getting Started',
    step1: 'Start a New Chat',
    step1Desc: 'Click the "New Chat" button from the dashboard.',
    step2: 'Ask a Question',
    step2Desc: 'Type your question or press the mic button to speak.',
    step3: 'Get Your Answer',
    step3Desc: 'The AI will provide you with a detailed response.',
    // Footer
    footerText: 'Revolutionizing agriculture with AI',
  };

  return (
    <div className="explorePage">

      {/* Hero */}
      <div className="exploreHero">
        <Leaf className="heroLeaf" size={48} />
        <h1>{t.heroTitle}</h1>
        <p className="heroSub">{t.heroSub}</p>
      </div>

      {/* About */}
      <section className="exploreSection aboutSection">
        <h2>{t.aboutTitle}</h2>
        <p>{t.aboutDesc}</p>
      </section>

      {/* Features Grid */}
      <section className="exploreSection featuresSection">
        <h2>{t.featuresTitle}</h2>
        <div className="featuresGrid">

          <div className="featureCard">
            <div className="featureIcon chatIcon"><MessageSquare size={28} /></div>
            <h3>{t.featureChat}</h3>
            <p>{t.featureChatDesc}</p>
          </div>

          <div className="featureCard">
            <div className="featureIcon weatherIcon"><Cloud size={28} /></div>
            <h3>{t.featureWeather}</h3>
            <p>{t.featureWeatherDesc}</p>
          </div>

          <div className="featureCard">
            <div className="featureIcon imageIcon"><Image size={28} /></div>
            <h3>{t.featureImage}</h3>
            <p>{t.featureImageDesc}</p>
          </div>

          <div className="featureCard">
            <div className="featureIcon voiceIcon"><Mic size={28} /></div>
            <h3>{t.featureVoice}</h3>
            <p>{t.featureVoiceDesc}</p>
          </div>

        </div>
      </section>

      {/* Getting Started Steps */}
      <section className="exploreSection stepsSection">
        <h2>{t.startTitle}</h2>
        <div className="stepsList">

          <div className="stepItem">
            <div className="stepNumber">1</div>
            <div className="stepContent">
              <h3>{t.step1}</h3>
              <p>{t.step1Desc}</p>
            </div>
            <ArrowRight className="stepArrow" size={20} />
          </div>

          <div className="stepItem">
            <div className="stepNumber">2</div>
            <div className="stepContent">
              <h3>{t.step2}</h3>
              <p>{t.step2Desc}</p>
            </div>
            <ArrowRight className="stepArrow" size={20} />
          </div>

          <div className="stepItem">
            <div className="stepNumber">3</div>
            <div className="stepContent">
              <h3>{t.step3}</h3>
              <p>{t.step3Desc}</p>
            </div>
          </div>

        </div>
      </section>

      {/* Footer */}
      <footer className="exploreFooter">
        <Leaf size={18} />
        <span>{t.footerText}</span>
      </footer>

    </div>
  )
}

export default ExplorePage