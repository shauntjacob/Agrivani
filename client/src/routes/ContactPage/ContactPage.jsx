import React, { useState } from 'react'
import './ContactPage.css'
import { useLanguage } from '../../context/LanguageContext';
import { Mail, Phone, MapPin, Send, Headphones } from 'lucide-react';

const ContactPage = () => {

  const { language } = useLanguage();
  const [formData, setFormData] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);

  const t = language === 'mr-IN' ? {
    // Hero
    heroTitle: 'आमच्याशी संपर्क करा',
    heroSub: 'आपल्या प्रश्नांसाठी आम्ही इथे आहेत',
    // Info cards
    email: 'ईमेल',
    emailVal: 'support@agrivani.com',
    phone: 'फोन',
    phoneVal: '+91 98765 43210',
    location: 'स्थान',
    locationVal: 'मुंबई, महाराष्ट्र, भारत',
    // Form
    formTitle: 'आम्हाला संदेश पाठवा',
    name: 'आपलं नाव',
    emailLabel: 'ईमेल पत्रा',
    subject: 'विषय',
    message: 'संदेश',
    namePlaceholder: 'तुमचं नाव टाइप करा',
    emailPlaceholder: 'तुमचा ईमेल टाइप करा',
    subjectPlaceholder: 'विषय लिहा',
    messagePlaceholder: 'आपला संदेश इथे लिहा...',
    sendBtn: 'संदेश पाठवा',
    successTitle: 'धन्यवाद!',
    successMsg: 'आपला संदेश पाठवला आहे. आम्ही 24 तामध्ये उत्तर देऊ.',
    // Support
    supportTitle: 'आधार व सहायता',
    supportDesc: 'तुम्हाला तकतकीच सहायता हवी असेल तर आमच्या AI चैटबॉट मध्ये जा आणि आपला प्रश्न विचारा. आমাদের दল सोमवार ते शुक्रवार सकाळी 9 ते रात्री 6 वाजेपर्यंत उपलब्ध आहे.',
  } : {
    // Hero
    heroTitle: 'Contact Us',
    heroSub: 'We are here to help you',
    // Info cards
    email: 'Email',
    emailVal: 'support@agrivani.com',
    phone: 'Phone',
    phoneVal: '+91 98765 43210',
    location: 'Location',
    locationVal: 'Mumbai, Maharashtra, India',
    // Form
    formTitle: 'Send Us a Message',
    name: 'Your Name',
    emailLabel: 'Email Address',
    subject: 'Subject',
    message: 'Message',
    namePlaceholder: 'Enter your name',
    emailPlaceholder: 'Enter your email',
    subjectPlaceholder: 'Write a subject',
    messagePlaceholder: 'Write your message here...',
    sendBtn: 'Send Message',
    successTitle: 'Thank You!',
    successMsg: 'Your message has been sent. We will get back to you within 24 hours.',
    // Support
    supportTitle: 'Support & Help',
    supportDesc: 'If you need quick assistance, head over to our AI chatbot and ask your question directly. Our team is available Monday to Friday, 9 AM to 6 PM.',
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Placeholder: in production this would POST to an API
    setSubmitted(true);
    setFormData({ name: '', email: '', subject: '', message: '' });
  };

  return (
    <div className="contactPage">

      {/* Hero */}
      <div className="contactHero">
        <Mail className="heroIcon" size={44} />
        <h1>{t.heroTitle}</h1>
        <p className="heroSub">{t.heroSub}</p>
      </div>

      {/* Contact Info Cards */}
      <div className="contactInfoRow">
        <div className="contactInfoCard">
          <div className="infoIcon emailIcon"><Mail size={22} /></div>
          <span className="infoLabel">{t.email}</span>
          <span className="infoValue">{t.emailVal}</span>
        </div>
        <div className="contactInfoCard">
          <div className="infoIcon phoneIcon"><Phone size={22} /></div>
          <span className="infoLabel">{t.phone}</span>
          <span className="infoValue">{t.phoneVal}</span>
        </div>
        <div className="contactInfoCard">
          <div className="infoIcon locationIcon"><MapPin size={22} /></div>
          <span className="infoLabel">{t.location}</span>
          <span className="infoValue">{t.locationVal}</span>
        </div>
      </div>

      {/* Contact Form */}
      <div className="contactFormWrap">
        <h2>{t.formTitle}</h2>

        {submitted ? (
          <div className="successBox">
            <div className="successIcon">✓</div>
            <h3>{t.successTitle}</h3>
            <p>{t.successMsg}</p>
            <button className="resetBtn" onClick={() => setSubmitted(false)}>
              {language === 'mr-IN' ? 'पुनरावलोकन करा' : 'Send Another'}
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="contactForm">
            <div className="formRow">
              <div className="formGroup">
                <label>{t.name}</label>
                <input type="text" name="name" placeholder={t.namePlaceholder} value={formData.name} onChange={handleChange} required />
              </div>
              <div className="formGroup">
                <label>{t.emailLabel}</label>
                <input type="email" name="email" placeholder={t.emailPlaceholder} value={formData.email} onChange={handleChange} required />
              </div>
            </div>
            <div className="formGroup">
              <label>{t.subject}</label>
              <input type="text" name="subject" placeholder={t.subjectPlaceholder} value={formData.subject} onChange={handleChange} required />
            </div>
            <div className="formGroup">
              <label>{t.message}</label>
              <textarea name="message" placeholder={t.messagePlaceholder} value={formData.message} onChange={handleChange} rows={4} required />
            </div>
            <button type="submit" className="sendBtn">
              <Send size={18} />
              {t.sendBtn}
            </button>
          </form>
        )}
      </div>

      {/* Support note */}
      <div className="supportBox">
        <div className="supportIcon"><Headphones size={24} /></div>
        <div className="supportContent">
          <h3>{t.supportTitle}</h3>
          <p>{t.supportDesc}</p>
        </div>
      </div>

    </div>
  )
}

export default ContactPage