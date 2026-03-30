function registerOwner(){
	const name=document.getElementById("name").value.trim();
	const email=document.getElementById("email").value.trim();
	const password=document.getElementById("password").value.trim();
	const store_name=document.getElementById("storeName").value.trim();
	const msg=document.getElementById("msg");

	if(!name||!email||!password||!store_name){
		msg.innerText="Please fill all fields";
		return;
	}

	fetch("http://localhost:3000/auth/register-owner",{
		method:"POST",
		headers:{"Content-Type":"application/json"},
		body:JSON.stringify({name,email,password,store_name})
	})
	.then(async res=>{
		const data=await res.json().catch(()=>({message:"Server error"}));
		if(!res.ok){
			throw new Error(data.message||"Registration failed");
		}
		return data;
	})
	.then(data=>{
		localStorage.setItem("authToken",data.token);
		localStorage.setItem("userId",data.user.id);
		localStorage.setItem("userName",data.user.name);
		localStorage.setItem("userRole",data.user.role);
		localStorage.setItem("storeId",String(data.store.id));
		localStorage.setItem("storeName",String(data.store.store_name||""));
		window.location.href="owner-dashboard.html";
	})
	.catch(err=>{
		msg.innerText=err.message||"Registration failed";
		console.log(err);
	});
}
