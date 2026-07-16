import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import { useTheme } from '../../context/ThemeContext';
import {
    User, Mail, Lock, Shield, Moon, Sun,
    Globe, CheckCircle, AlertCircle, Save, X
} from 'lucide-react';
import './SettingsPage.css';

const SettingsPage = () => {
    const { user, login } = useAuth();
    const { language, toggleLanguage } = useLanguage();
    const { theme, toggleTheme } = useTheme();
    const isMr = language === 'mr-IN';

    const [savingAccount, setSavingAccount] = useState(false);
    const [changingPass, setChangingPass] = useState(false);
    const [status, setStatus] = useState({ type: '', msg: '' });

    const [accountData, setAccountData] = useState({
        name: user?.name || '',
        email: user?.email || '',
    });

    const [passData, setPassData] = useState({
        currentPassword: '',
        newPassword: '',
        confirmPassword: '',
    });

    const t = isMr ? {
        title: 'खाते सेटिंग्ज',
        account: 'खाते माहिती',
        security: 'सुरक्षा',
        preferences: 'पसंती',
        name: 'पूर्ण नाव',
        email: 'ईमेल पत्ता',
        currentPass: 'वर्तमान पासवर्ड',
        newPass: 'नवीन पासवर्ड',
        confirmPass: 'पासवर्डची पुष्टी करा',
        lang: 'ॲप भाषा',
        theme: 'थीम मोड',
        saveAccount: 'माहिती अपडेट करा',
        changePass: 'पासवर्ड बदला',
        success: 'यशस्वीरित्या जतन झाले!',
        error: 'काहीतरी चुकले.',
        passMismatch: 'पासवर्ड जुळत नाहीत.'
    } : {
        title: 'Account Settings',
        account: 'Account Basics',
        security: 'Security',
        preferences: 'Preferences',
        name: 'Full Name',
        email: 'Email Address',
        currentPass: 'Current Password',
        newPass: 'New Password',
        confirmPass: 'Confirm New Password',
        lang: 'App Language',
        theme: 'Display Mode',
        saveAccount: 'Update Basics',
        changePass: 'Change Password',
        success: 'Saved successfully!',
        error: 'Something went wrong.',
        passMismatch: 'Passwords do not match.'
    };

    const handleUpdateAccount = async (e) => {
        e.preventDefault();
        setSavingAccount(true);
        setStatus({ type: '', msg: '' });
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/update-account`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(accountData),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                login(data.user);
                setStatus({ type: 'success', msg: t.success });
            } else {
                setStatus({ type: 'error', msg: data.error || t.error });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: t.error });
        } finally {
            setSavingAccount(false);
        }
    };

    const handleChangePassword = async (e) => {
        e.preventDefault();
        if (passData.newPassword !== passData.confirmPassword) {
            return setStatus({ type: 'error', msg: t.passMismatch });
        }
        setChangingPass(true);
        setStatus({ type: '', msg: '' });
        try {
            const res = await fetch(`${import.meta.env.VITE_API_URL}/api/auth/change-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    currentPassword: passData.currentPassword,
                    newPassword: passData.newPassword
                }),
                credentials: 'include'
            });
            const data = await res.json();
            if (data.success) {
                setStatus({ type: 'success', msg: t.success });
                setPassData({ currentPassword: '', newPassword: '', confirmPassword: '' });
            } else {
                setStatus({ type: 'error', msg: data.error || t.error });
            }
        } catch (err) {
            setStatus({ type: 'error', msg: t.error });
        } finally {
            setChangingPass(false);
        }
    };

    return (
        <div className="settings-page">
            <div className="settings-container">
                <div className="settings-header">
                    <h1>{t.title}</h1>
                    {status.msg && (
                        <div className={`status-pill ${status.type}`}>
                            {status.type === 'success' ? <CheckCircle size={16} /> : <AlertCircle size={16} />}
                            {status.msg}
                        </div>
                    )}
                </div>

                <div className="settings-grid">
                    {/* Account Section */}
                    <section className="settings-card">
                        <div className="card-header">
                            <User size={20} />
                            <h2>{t.account}</h2>
                        </div>
                        <form onSubmit={handleUpdateAccount}>
                            <div className="input-group">
                                <label>{t.name}</label>
                                <div className="input-wrapper">
                                    <User className="input-icon" size={18} />
                                    <input
                                        type="text"
                                        value={accountData.name}
                                        onChange={e => setAccountData({ ...accountData, name: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>{t.email}</label>
                                <div className="input-wrapper">
                                    <Mail className="input-icon" size={18} />
                                    <input
                                        type="email"
                                        value={accountData.email}
                                        onChange={e => setAccountData({ ...accountData, email: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="save-btn" disabled={savingAccount}>
                                {savingAccount ? <span className="spinner" /> : <Save size={18} />}
                                {t.saveAccount}
                            </button>
                        </form>
                    </section>

                    {/* Preferences Section */}
                    <section className="settings-card">
                        <div className="card-header">
                            <Shield size={20} />
                            <h2>{t.preferences}</h2>
                        </div>
                        <div className="pref-items">
                            <div className="pref-item">
                                <div className="pref-info">
                                    <Globe size={18} />
                                    <span>{t.lang}</span>
                                </div>
                                <button className="toggle-pill" onClick={toggleLanguage}>
                                    {language === 'mr-IN' ? 'मराठी' : 'English'}
                                </button>
                            </div>
                            <div className="pref-item">
                                <div className="pref-info">
                                    {theme === 'dark' ? <Moon size={18} /> : <Sun size={18} />}
                                    <span>{t.theme}</span>
                                </div>
                                <button className="toggle-pill" onClick={toggleTheme}>
                                    {theme === 'dark' ? (isMr ? 'गडद' : 'Dark') : (isMr ? 'प्रकाश' : 'Light')}
                                </button>
                            </div>
                        </div>
                    </section>

                    {/* Security Section */}
                    <section className="settings-card security">
                        <div className="card-header">
                            <Shield size={20} />
                            <h2>{t.security}</h2>
                        </div>
                        <form onSubmit={handleChangePassword}>
                            <div className="input-group">
                                <label>{t.currentPass}</label>
                                <div className="input-wrapper">
                                    <Lock className="input-icon" size={18} />
                                    <input
                                        type="password"
                                        value={passData.currentPassword}
                                        onChange={e => setPassData({ ...passData, currentPassword: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>{t.newPass}</label>
                                <div className="input-wrapper">
                                    <Lock className="input-icon" size={18} />
                                    <input
                                        type="password"
                                        value={passData.newPassword}
                                        onChange={e => setPassData({ ...passData, newPassword: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="input-group">
                                <label>{t.confirmPass}</label>
                                <div className="input-wrapper">
                                    <Lock className="input-icon" size={18} />
                                    <input
                                        type="password"
                                        value={passData.confirmPassword}
                                        onChange={e => setPassData({ ...passData, confirmPassword: e.target.value })}
                                    />
                                </div>
                            </div>
                            <button type="submit" className="save-btn" disabled={changingPass}>
                                {changingPass ? <span className="spinner" /> : <Save size={18} />}
                                {t.changePass}
                            </button>
                        </form>
                    </section>
                </div>
            </div>
        </div>
    );
};

export default SettingsPage;
