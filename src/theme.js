// src/theme.js

// Esta función se ejecuta inmediatamente para evitar el "parpadeo" de la página.
// Lee la preferencia del tema desde el almacenamiento local y aplica la clase 'dark'
// al elemento <html> si es necesario.

(function() {
    const theme = localStorage.getItem('theme') || 'light'; // Si no hay nada, el tema por defecto es 'light'
    if (theme === 'dark') {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
})();