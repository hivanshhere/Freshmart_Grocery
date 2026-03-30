function setMsg(text){
	const msg=document.getElementById("msg");
	if(msg) msg.innerText=text||"";
}

function onRoleChange(){
	const role=document.getElementById("role").value;
	const ownerFields=document.getElementById("ownerFields");
	const storeName=document.getElementById("storeName");

	if(role==="owner"){
		ownerFields.style.display="block";
		storeName.setAttribute("required","required");
	}else{
		ownerFields.style.display="none";
		storeName.removeAttribute("required");
		storeName.value="";
	}
	setMsg("");
}

function validateForm(){
	const form=document.getElementById("registerForm");
	const role=document.getElementById("role").value;
	const name=document.getElementById("name");
	const email=document.getElementById("email");
	const password=document.getElementById("password");
	const storeName=document.getElementById("storeName");

	// Trigger built-in validation UI state
	if(!form.checkValidity()){
		// Custom friendly message
		if(!name.value.trim()) return "Name is required";
		if(name.validity.patternMismatch) return "Name should contain only letters and basic punctuation";
		if(!email.value.trim()) return "Email is required";
		if(email.validity.typeMismatch) return "Please enter a valid email";
		if(!password.value.trim()) return "Password is required";
		if(password.value.trim().length<6) return "Password must be at least 6 characters";
		if(role==="owner"){
			if(!storeName.value.trim()) return "Store name is required for store owners";
			if(storeName.validity.patternMismatch) return "Store name contains invalid characters";
		}
		return "Please fill all required fields correctly";
	}

	// Extra trimming checks
	if(name.value.trim().length<2) return "Name must be at least 2 characters";
	if(password.value.trim().length<6) return "Password must be at least 6 characters";
	if(role==="owner" && storeName.value.trim().length<2) return "Store name must be at least 2 characters";

	return null;
}

function registerUser(){
	setMsg("");
	const err=validateForm();
	if(err){
		setMsg(err);
		return;
	}

	const role=document.getElementById("role").value;
	const name=document.getElementById("name").value.trim();
	const email=document.getElementById("email").value.trim();
	const password=document.getElementById("password").value.trim();
	const store_name=document.getElementById("storeName").value.trim();

	const endpoint = role==="owner" ? "http://localhost:3000/auth/register-owner" : "http://localhost:3000/auth/register-customer";
	const payload = role==="owner" ? {name,email,password,store_name} : {name,email,password};

	fetch(endpoint,{
		method:"POST",
		headers:{"Content-Type":"application/json"},
		body:JSON.stringify(payload)
	})
	.then(async res=>{
		let data=null;
		let text=null;
		try{
			data=await res.json();
		}catch(e){
			text=await res.text().catch(()=>null);
		}

		if(!res.ok){
			if(data && data.message) throw new Error(data.message);
			if(text && text.includes("Cannot POST")){
				throw new Error("Backend route not found. Please restart server (node server.js / npm start)");
			}
			throw new Error("Registration failed");
		}

		return data;
	})
	.then(data=>{
		localStorage.setItem("authToken",data.token);
		localStorage.setItem("userId",data.user.id);
		localStorage.setItem("userName",data.user.name);
		localStorage.setItem("userRole",data.user.role);

		if(data.store && data.store.id){
			localStorage.setItem("storeId",String(data.store.id));
			localStorage.setItem("storeName",String(data.store.store_name||""));
		}

		if(data.user.role==="owner"){
			window.location.href="owner-dashboard.html";
		}else{
			window.location.href="stores.html";
		}
	})
	.catch(e=>{
		setMsg(e.message||"Registration failed");
		console.log(e);
	});
}

// Init
onRoleChange();
