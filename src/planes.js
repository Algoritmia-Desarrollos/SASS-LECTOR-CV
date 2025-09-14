document.addEventListener('DOMContentLoaded', () => {
    const basicBtn = document.getElementById('upgrade-basic-btn');
    const professionalBtn = document.getElementById('upgrade-professional-btn');

    // Objeto con los IDs de tus planes de Mercado Pago
    const planConfig = {
        basic: {
            id: 'a32322dc215f432ba91d288e1cf7de88', 
        },
        professional: {
            id: '367e0c6c5785494f905b048450a4fa37',
        }
    };

    const redirectToMercadoPago = (planName) => {
        const selectedPlan = planConfig[planName];

        if (!selectedPlan || selectedPlan.id.length < 30) {
            alert('Error: ID del plan no está configurado correctamente en src/planes.js');
            return;
        }

        // Construimos la URL de checkout
        const checkoutUrl = `https://www.mercadopago.com.ar/subscriptions/checkout?preapproval_plan_id=${selectedPlan.id}`;
        
        // Redirigimos al usuario
        window.location.href = checkoutUrl;
    };

    if (basicBtn) {
        basicBtn.addEventListener('click', (e) => {
            e.preventDefault();
            basicBtn.textContent = 'Redirigiendo...';
            redirectToMercadoPago('basic');
        });
    }

    if (professionalBtn) {
        professionalBtn.addEventListener('click', (e) => {
            e.preventDefault();
            professionalBtn.textContent = 'Redirigiendo...';
            redirectToMercadoPago('professional');
        });
    }
});