'use strict';
(async () => {
  const form=document.querySelector('.auth-form');if(!form)return;
  const status=form.querySelector('.form-status'),button=form.querySelector('[type=submit]');
  const say=text=>{status.textContent=text;status.hidden=false;status.focus();};
  const password=form.querySelector('#password'),confirmation=form.querySelector('#confirm-password');
  form.querySelectorAll('input').forEach(input=>input.addEventListener('input',()=>{
    if(confirmation)confirmation.setCustomValidity(confirmation.value&&confirmation.value!==password.value?'Your passwords do not match.':'');
  }));
  document.querySelectorAll('.password-toggle').forEach(toggle=>toggle.addEventListener('click',()=>{
    const input=document.getElementById(toggle.getAttribute('aria-controls')),show=input.type==='password';
    input.type=show?'text':'password';toggle.setAttribute('aria-pressed',String(show));toggle.setAttribute('aria-label',(show?'Hide':'Show')+' password');
  }));
  let ready=true;
  if(form.dataset.authMode==='reset')try{await Spa.acceptRecovery();}catch(error){ready=false;say(error.message);}
  button.disabled=!ready;
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(!ready||button.disabled||!form.reportValidity())return;
    button.disabled=true;
    const label=button.innerHTML;
    if(form.dataset.authMode==='login'){button.textContent='Signing in…';button.setAttribute('aria-busy','true');}
    try{
      if(form.dataset.authMode==='login'){
        await Spa.login(form.elements.email.value.trim(),password.value);form.reset();location.replace('admin-dashboard.html');
      }else if(form.dataset.authMode==='forgot'){
        await Spa.recover(form.elements.email.value.trim());say('If this address has a staff account, a password reset link will be sent. Check your inbox and spam folder.');
      }else if(form.dataset.authMode==='reset'){
        await Spa.reset(password.value);form.reset();ready=false;say('Password updated. Sign in with your new password.');
        const link=document.createElement('a');link.href='admin-login.html';link.textContent='Return to sign in';status.append(' ',link);
      }else say('Staff accounts are created and authorised by the spa owner. Contact the owner for access.');
    }catch(error){say(error.message);}finally{button.disabled=!ready;button.innerHTML=label;button.removeAttribute('aria-busy');}
  });
})();

