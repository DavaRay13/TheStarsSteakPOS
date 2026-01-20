document.addEventListener('DOMContentLoaded', () => {
    
    const loginForm = document.getElementById('login-form');
    const messageEl = document.getElementById('message');

    loginForm.addEventListener('submit', async (event) => {
        event.preventDefault(); 
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        messageEl.textContent = 'Mencoba login...';
        messageEl.style.color = 'gray';

        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username: username,
                    password: password
                })
            });

            const data = await response.json();

            if (response.ok) { 
                messageEl.textContent = data.message;
                messageEl.style.color = 'green';
                
                // Simpan semua data user
                localStorage.setItem('authToken', data.token);
                localStorage.setItem('userRole', data.role);
                localStorage.setItem('userId', data.user_id);
                localStorage.setItem('username', data.username);
                
                setTimeout(() => {
                    window.location.href = data.redirect_url; 
                }, 1000);
                
            } else {
                messageEl.textContent = `Error: ${data.error}`;
                messageEl.style.color = 'red';
            }
        } catch (error) {
            console.error('Error:', error);
            messageEl.textContent = 'Tidak bisa terhubung ke server.';
            messageEl.style.color = 'red';
        }
    });
});