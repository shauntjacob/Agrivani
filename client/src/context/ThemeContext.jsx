import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext();

export const ThemeProvider = ({ children }) => {
    // Check local storage or system preference
    const [theme, setTheme] = useState(() => {
        const saved = localStorage.getItem('agrivani-theme');
        if (saved) return saved;
        // We default to light if no preference, but dashboard aesthetics are dark-first currently
        return 'dark';
    });

    useEffect(() => {
        localStorage.setItem('agrivani-theme', theme);
        // Apply theme class to document body
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => useContext(ThemeContext);
