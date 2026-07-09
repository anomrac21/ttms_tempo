var number = '18682354664'; // Default number, will be updated by selectLocation function
var name = 'OMG Sushi'
var messageStart = 'Powered by TTMenus\n'+name+'\nHello, Good Day\nI would like to order the following\n\nORDER\n';
var messageBody = '';
var messageEnd = '\nThank You!\nLooking forward to confirming this order';

var modes =  [ 	{'name':'takeaway'},{'name':'dinein'}];
var currentMode = 'dinein'; 

var orderSize = '';
var orderFlav = '';

var order = [];
var basePrice = 0;

var orderSides = [];
var sidePrice = 0;
var regAmt=0;
var premAmt=0;

var orderAdd = [];
var addPrice = 0;

var orderMod = [];
var modPrice = 0;

var vat = 0.125;
var vatcost = 0;

var service = 0.1;
var servicecost = 0;

var price = 0;

var myTable='';

var currentoptions;

var sizePrice=0;

function showShop(){
	document.getElementById("orderModal").classList.remove('order-hidden');
	document.body.classList.add('modal-open');
}
function closeShop(){
	document.getElementById("orderModal").classList.add('order-hidden');
	var cart = document.getElementById("cart");
  var footerBtns = document.getElementById("footerBtns");
  cart.classList.add('cart-hidden');
  footerBtns.classList.add('grad2');
  footerBtns.classList.remove('grad1');
  footerBtns.classList.remove('bigfont');
  footerBtns.classList.add('smallfont');
	var addbtn = document.getElementById("addicon");
	var modbtn = document.getElementById("modicon");
	orderSides=[];
  orderAdd=[];
	orderMod=[];
	regAmt=0;
	premAmt=0;
	//console.log(orderMod);
}
function openItem(ele,options){
	console.log("openShop");
	showShop();
	regAmt=0;
	premAmt=0;
	sidePrice=0;
	addPrice=0;
	modPrice=0;
	currentoptions=options;
	document.getElementById("itemAmt").innerText=(1);
	document.getElementById("sideList").innerText='';
	document.getElementById("modList").innerText='';
	document.getElementById("addModList").innerText='';

	document.getElementById("itemCategory").innerText=(options.category);
	const currentPageName = document.title;
	if (!currentPageName.startsWith(options.category)) { 
		document.getElementById("itemCategory").setAttribute('href',options.categoryurl); 
		document.getElementById("itemImages").setAttribute('href',options.url);
	}else{
		document.getElementById("itemCategory").setAttribute('href','#'); 
		document.getElementById("itemImages").setAttribute('href','#');
	}

	document.getElementById("itemName").innerText=(options.name);
	if (!currentPageName.startsWith(options.name)) { 
		document.getElementById("itemName").setAttribute('href',options.url); 
		document.getElementById("itemImages").setAttribute('href',options.url);
	}else{
		document.getElementById("itemName").setAttribute('href','#'); 
		document.getElementById("itemImages").setAttribute('href','#');
	}
	document.getElementById("itemDesc").innerHTML=(options.desc);
	


	if(options.images.length>0){
		var imgHtml = '';
		for (var i = 0; i<=options.images.length - 1;  i++) {
			imgHtml = imgHtml+'<img src="/'+options.images[i]+'">';
		}
		document.getElementById("itemImages").innerHTML=imgHtml;

	}else{
		document.getElementById("itemImages").innerHTML='<img src="/branding/favicon-400x200.webp">';
	}
	
	//Size Options
	var sizeHtml = '';
	for (var i = 0; i<=options.sizes.length - 1;  i++) {
			if(i==0){
				if(options.sizes[i]=='-'){
					sizeHtml = sizeHtml+'<a onclick="'+'setBaseSize(this);"'+' class="hide select">'+options.sizes[i]+'</a>';
				}else{
					sizeHtml = sizeHtml+'<a onclick="'+'setBaseSize(this);"'+' class="select">'+options.sizes[i]+'</a>';
				}
			}else{
				sizeHtml = sizeHtml+'<a onclick="'+'setBaseSize(this);"'+' class="">'+options.sizes[i]+'</a>';
			}
	}
	document.getElementById("itemSizeControl").innerHTML=sizeHtml;
	setBaseSize(document.getElementById("itemSizeControl").childNodes[0]);

//Flavours Options
	var flavoursHtml = '';
	for (var i = 0; i<=options.flavours.length - 1;  i++) {
			if(i==0){
				if(options.flavours[i]=='-'){
						flavoursHtml = flavoursHtml+'<a onclick=" setBaseFlav(this);'+'" class="hide select">'+options.flavours[i]+'</a>';
					}else{
						flavoursHtml = flavoursHtml+'<a onclick=" setBaseFlav(this);'+'" class="select">'+options.flavours[i]+'</a>';
					}
			}else{
				flavoursHtml = flavoursHtml+'<a onclick=" setBaseFlav(this);'+'">'+options.flavours[i]+'</a>';
			}
	}
	document.getElementById("itemFlavourControl").innerHTML=flavoursHtml;
	setBaseFlav(document.getElementById("itemFlavourControl").childNodes[0]);

	//Sides Options
	var sideHtml = '';
	if(options.sides.length>0){
		makeSidesHtml(sideHtml,0);
	} else {
		document.getElementById("itemSideContainer").classList.add("hide");
	}
	
	//Additional Options
	var additionsHtml = '';
	if(options.additions.length>0){
		makeAdditionsHtml(additionsHtml,0);
	} else {
		document.getElementById("itemAddContainer").classList.add("hide");
	}
	
	//Mods Options
	var modificationsHtml = '';
	if(options.modifications.length>0){
		makeModificationsHtml(modificationsHtml,0);
	} else {
		document.getElementById("itemModContainer").classList.add("hide");
	}
	
	orderSides=[];
	orderAdd=[];
	orderMod=[];
	updatePrices();
}

function makeModificationsHtml(modificationsHtml,index) {
	console.log(index+' modificationsHtml:- '+modificationsHtml);
	if(currentoptions.modifications.length>index){
		console.log(currentoptions.modifications.length+'>'+index);
		modificationsHtml = modificationsHtml+'<a onclick="selectToggle(this);ModPrice(this,'+currentoptions.modifications[index+1]+');">'+currentoptions.modifications[index]+'</a>'
		makeModificationsHtml(modificationsHtml,index+2);
	} else {
		document.getElementById("itemMods").innerHTML='<h3 class="title center main-text-color">Modifications</h3><div class="container">'+modificationsHtml+'</div><button onclick="openModMenu();">Close</button>';
		document.getElementById("itemModContainer").classList.remove("hide");
	}

}

function makeAdditionsHtml(additionsHtml,index) {
	console.log(index+' additionsHtml:- '+additionsHtml);
	if(currentoptions.additions.length>index){
		console.log(currentoptions.sides.length+'>'+index);
		additionsHtml = additionsHtml+'<a onclick="selectToggle(this);AddPrice(this,'+currentoptions.additions[index+1]+');'+'">'+currentoptions.additions[index]+'</a>'
		makeAdditionsHtml(additionsHtml,index+2);
	} else {
		document.getElementById("itemAddMods").innerHTML ='<h3 class="title center main-text-color">Additional Modifications</h3><div class="container">'+additionsHtml+'</div><button onclick="openAddMenu();">Close</button>';
		document.getElementById("itemAddContainer").classList.remove("hide");
	}

}

function makeSidesHtml(sideHtml,index) {
	console.log(index+' Sides HTML:- '+sideHtml);
	if(currentoptions.sides.length>index){
		console.log(currentoptions.sides.length+'>'+index);
		if(currentoptions.sides[index+1]=='Regular'){
			sideHtml = sideHtml+'<b class="hide">1</b><a  class="regularside" onclick="selectAmt(this);">'+currentoptions.sides[index]+'</a><p class="hide" onclick="addExtra(this);"><i class="fa fa-plus"></i></p>';
		}else if(currentoptions.sides[index+1]=='Premium'){
			sideHtml = sideHtml+'<b class="hide">1</b><a  class="premiumside" onclick="selectAmt(this);">'+currentoptions.sides[index]+' <i class="fa fa-star"></i></a><p onclick="addExtra(this);" class="hide"><i class="fa fa-plus"></i></p>';	
		}
		makeSidesHtml(sideHtml,index+3);
	} else {
		document.getElementById("itemSides").innerHTML='<h3 class="title center main-text-color">Sides</h3><div >'+sideHtml+'</div><button onclick="openSideMenu();">Close</button>';
		document.getElementById("itemSideContainer").classList.remove("hide");
	}

}

function addSides(ele){
	if (ele.classList.contains('select')){
		// console.log("ADD SIDE: "+ele.previousSibling.innerText+" "+ele.innerText);
		orderSides.push(ele.previousSibling.innerText+" "+ele.innerText);
		if(ele.classList.contains('regularside')){
			regAmt=regAmt+1;
			if(regAmt>=currentoptions.sideoptions[4]){
				sidePrice=sidePrice+currentoptions.sideoptions[5];
			}
		}else if(ele.classList.contains('premiumside')){
			premAmt=premAmt+1;
			if(premAmt>=currentoptions.sideoptions[7].premium.valuecount){
				sidePrice=sidePrice+currentoptions.sideoptions[8].premium.value;
			}
		}

	}
	// console.log(orderSides);
	updatePrices();
}

function removeSides(ele){
	if (ele.classList.contains('select')){
		if(ele.classList.contains('regularside')){
			if(regAmt>=currentoptions.sideoptions[4]){
				sidePrice=sidePrice-currentoptions.sideoptions[5];
			}
			regAmt=regAmt-parseInt(ele.previousSibling.innerText);

		}else if(ele.classList.contains('premiumside')){
			if(premAmt>=currentoptions.sideoptions[7]){
				sidePrice=sidePrice-currentoptions.sideoptions[8];
			}
			premAmt=premAmt-parseInt(ele.previousSibling.innerText);
		}
		// console.log("REMOVE SIDE: "+ele.previousSibling.innerText+" "+ele.innerText);
		var index = orderSides.indexOf(ele.previousSibling.innerText+" "+ele.innerText);
		orderSides.splice(index,1);
		ele.classList.remove('select');
		ele.previousSibling.classList.add('hide')
		ele.previousSibling.innerText=1;
	 	ele.nextSibling.classList.add('hide')
	 	
	}
	// console.log(orderSides);
	updatePrices();
}

function addExtra(ele){
	var selEle = ele.parentElement.getElementsByClassName('select');
	var num = 0;
		for (var i = 0; i<=selEle.length - 1;  i++) {
			num = num + parseInt(selEle[i].previousSibling.innerText);
		}
		if(num<currentoptions.sideoptions[0]){
			if(selEle.length<(currentoptions.sideoptions[0]) && parseInt(ele.previousSibling.previousSibling.innerText)<(currentoptions.sideoptions[0])){
				// console.log(orderSides);
				// console.log("SPLICE: "+(ele.previousSibling.previousSibling.innerText+" "+ele.previousSibling.innerText));
				var index = orderSides.indexOf(ele.previousSibling.previousSibling.innerText+" "+ele.previousSibling.innerText);
				orderSides.splice(index,1);
				// console.log(orderSides);
				ele.previousSibling.previousSibling.innerText=parseInt(ele.previousSibling.previousSibling.innerText)+1;
				addSides(ele.previousSibling);
			}
		}

}

function AddPrice(ele,i){
	if (ele.classList.contains('select')){
		addPrice = addPrice+i;

		orderAdd.push(ele.innerText);
	}else{
		addPrice = addPrice-i;
		var index = orderAdd.indexOf(ele.innerText);
		orderAdd.splice(index,1);
	}
	if(addPrice<0){
		addPrice = 0;
	}
	//console.log("AddPrice");
	updatePrices();
}

function ModPrice(ele,i){
	if (ele.classList.contains('select')){
		modPrice = modPrice+i;
		orderMod.push(ele.innerText);
		ele.nextSibling.classList.remove('hide');
	}else{
		modPrice = modPrice-i;
		var index = orderMod.indexOf(ele.innerText);
		orderMod.splice(index,1);
		ele.nextSibling.classList.add('hide');
	}
	//console.log("ModPrice");
	updatePrices();
}

function lineCostCalc(ele,i){
	var linecost=0;
	if(ele.classList.contains('select')){
		linecost = +i;
	}else{
		linecost = -i;
	}
	document.getElementById("itemPrice").innerText=('$'+(basePrice+addPrice+modPrice));
	//console.log("lineCostCalc");
	updatePrices();
}

function itemAmtCalc(value){
	var myAmt = document.getElementById("itemAmt");
	var newValue = parseInt(myAmt.innerText);
	newValue=newValue + value;
	if(newValue>0){
		myAmt.innerText = newValue;	
	}
	//console.log("itemAmtCalc");
	updatePrices();
}


function setBasePrice(index){
	if(currentoptions.items.length>index){
		if(currentoptions.items[index]==orderSize){
			console.log("CurrentSize :"+ orderSize+"|"+ currentoptions.items[index])

			if(currentoptions.items[index+1]==orderFlav){
				console.log("Current Flav :"+ orderFlav +"|"+currentoptions.items[index+1])
				basePrice=currentoptions.items[index+2];
				return;
			}else{
				console.log("!No Match Flav:"+ orderFlav +"|"+currentoptions.items[index+1])
				index=index+3;
				setBasePrice(index);
			}

		}else{
			console.log("!No Match Size:"+orderSize+"|"+currentoptions.items[index])
			index=index+3;
			setBasePrice(index);
		}

	}
	updatePrices();
}

function setBaseSize(ele){
	orderSize = ele.innerText;
	// console.log("setVaseSize :"+orderSize);
	selectOnly(ele);
	setBasePrice(0);
	updatePrices();
}

function setBaseFlav(ele){
	orderFlav = ele.innerText;
	// console.log("setBaseFlav :"+orderFlav);
	selectOnly(ele);
	setBasePrice(0);
	updatePrices();
}

function updatePrices(){
	document.getElementById("itemPrice").innerText=('$'+(basePrice+sidePrice+addPrice+modPrice));
	document.getElementById("itemAddCart").innerHTML=('<i class="fa fa-cart-plus"></i> '+(basePrice+sidePrice+addPrice+modPrice));

	var lineCost = parseInt(document.getElementById("itemAmt").innerText)*(basePrice+sidePrice+addPrice+modPrice);
	document.getElementById("itemAddCart").innerHTML=('<i class="fa fa-cart-plus"></i> $'+lineCost);

	var funcText = 'addItem("'+document.getElementById("itemName").innerText+'","'+orderSize+' '+orderFlav+'","'+orderSides+'","'+orderAdd+'","'+orderMod+'","'+document.getElementById("itemAmt").innerText+'",'+lineCost+');';
	document.getElementById("itemAddCart").setAttribute( "onclick", funcText);

	//console.log(funcText);
	//console.log(orderMod);
}

function addFocus(ele){
 	var selEle = document.getElementsByClassName('selected');
 	for (var i = selEle.length - 1; i >= 0; i--) {
 		selEle[i].classList.remove('selected');
 	}
 	ele.classList.add('selected');
}

function selectOnly(ele){
	if(!ele.classList.contains('select')){
		var selEle = ele.parentElement.getElementsByClassName('select')
	 	for (var i = selEle.length - 1; i >= 0; i--) {
	 		selEle[i].classList.remove('select');
	 	}
		ele.classList.add('select');
	}
}

function selectToggle(ele){
	if(ele.classList.contains('select')){
		ele.classList.remove('select');
	}else{
		ele.classList.add('select');
		//add text to order
	}
	return ele.classList.contains('select');
}

function selectAmt(ele){
	if(ele.classList.contains('select')){
		removeSides(ele);
	}else{
		var selEle = ele.parentElement.getElementsByClassName('select');
		var num = 0;
		for (var i = 0; i<=selEle.length - 1;  i++) {
			num = num + parseInt(selEle[i].previousSibling.innerText);
		}
		if (num<currentoptions.sideoptions[0] && selEle.length<currentoptions.sideoptions[0]){
					num = num+1;
					ele.classList.add('select');
					addSides(ele);
		 			ele.previousSibling.classList.remove('hide');
		 			ele.nextSibling.classList.remove('hide');
		}
	}	
}

function itemAmtCalc(value){
	var myAmt = document.getElementById("itemAmt");
	var newValue = parseInt(myAmt.innerText);
	newValue=newValue + value;
	if(newValue>0){
		myAmt.innerText = newValue;	
	}
	//console.log("itemAmtCalc");
	updatePrices();
}


// CART

function toggleCart(){
    var cart = document.getElementById("cart");
    var footerBtns = document.getElementById("footerBtns");
    if(cart.classList.contains('cart-hidden')){
      cart.classList.remove('cart-hidden');
      footerBtns.classList.add('bigfont');
      footerBtns.classList.add('cartopen');
      footerBtns.classList.remove('smallfont');
      footerBtns.classList.add('grad1');
      footerBtns.classList.remove('grad2');
    }else{
      cart.classList.add('cart-hidden');
      footerBtns.classList.remove('cartopen');
      footerBtns.classList.add('grad2');
      footerBtns.classList.remove('grad1');
      footerBtns.classList.remove('bigfont');
      footerBtns.classList.add('smallfont');
      
    }
  }
  function closeCart(){
    var cart = document.getElementById("cart");
    var footerBtns = document.getElementById("footerBtns");
    cart.classList.add('cart-hidden');
    footerBtns.classList.remove('cartopen');
    footerBtns.classList.add('grad2');
    footerBtns.classList.remove('grad1');
    footerBtns.classList.remove('bigfont');
    footerBtns.classList.add('smallfont');
	}

	function saveCart() {
		const baseURL = window.location.origin;
		localStorage.setItem('menu', JSON.stringify(baseURL));
	  localStorage.setItem('cart', JSON.stringify(order));
	  console.log(localStorage.getItem('cart'));
	}

	function loadCart() {
		const savedMenu = localStorage.getItem('menu');
		const baseURL = window.location.origin;
		if (savedMenu == JSON.stringify(baseURL) ){
		  const savedCart = localStorage.getItem('cart');
		  if (savedCart) {
		    order = JSON.parse(savedCart);
		    console.log(order);
		    buildOrderText(); // Refresh the cart UI with the loaded data
		  }
	  }
	}

  function addItem(item,size,sides,adds,mods,amt,cost){
  order.push({"item":item,"size":size,"sides":sides,"adds":adds, "mods":mods, "amt":amt,"cost":cost});
  additemtocart();
  cartadditem();
  buildOrderText();
  saveCart();
  updateCart(1);
  //openCart();
  //printValues();
}
function additemtocart(){
  let modal = document.getElementById("orderModal");
  modal.classList.add("additemtocart");
  setTimeout(()=>{
  			closeShop();
        modal.classList.remove("additemtocart");
  },             500);  
   
} 
function cartadditem(){
  let cart = document.getElementById("carticon");
  cart.classList.add("cartadditem");
  setTimeout(()=>{
        cart.classList.remove("cartadditem");
  },             500);  
   
} 
function removeItem(i){
	order.splice(i,1);
	buildOrderText();
	saveCart();
	updateCart(-1);
	//printValues();
}
function removeAllItems(){
	order=[];
	var c =order.index-1;
	order=[];
	localStorage.removeItem('cart');  // Clear cart from localStorage
	buildOrderText();
	document.getElementById("cartcount").innerText= 0;
  updateCart(0);
	//printValues();
}

function updateCart(i){
    var cart = document.getElementById("cartcount");
    cart.innerText= parseInt(cart.innerText)+i;
    
    if(parseInt(cart.innerText)<=0){
    	cart.classList.add('hide');
    }else{
    	cart.classList.remove('hide');
    }
}

// Function to handle location selection in cart
function selectLocation(whatsappNumber) {
    if (whatsappNumber) {
        number = whatsappNumber;
        console.log('Location selected, WhatsApp number updated to:', number);
        
        // Get the selected option to access additional data
        const select = document.getElementById('locationSelect');
        const selectedOption = select.options[select.selectedIndex];
        
        if (selectedOption) {
            const address = selectedOption.getAttribute('data-address');
            const lat = selectedOption.getAttribute('data-lat');
            const lng = selectedOption.getAttribute('data-lng');
            const orderingTables = selectedOption.getAttribute('data-orderingtables');
            
            console.log('Selected location:', {
                address: address,
                lat: lat,
                lng: lng,
                orderingTables: orderingTables,
                whatsapp: whatsappNumber
            });
            
            // Update any location-dependent UI elements here
            // For example, you might want to update the order button text or other elements
        }
    } else {
        console.log('No location selected');
    }
}

// Function to initialize location selection
function initializeLocationSelection() {
    const locationSelect = document.getElementById('locationSelect');
    if (locationSelect) {
        // Set the first location as selected by default
        if (locationSelect.options.length > 1) { // Skip the "Select a location" option
            const firstLocationOption = locationSelect.options[1]; // Index 1 is the first actual location
            if (firstLocationOption && firstLocationOption.value) {
                selectLocation(firstLocationOption.value);
            }
        }
        console.log('Location selection initialized');
    } else {
        console.log('Location select element not found');
    }
}

function buildOrderText(){
	messageBody='';
	var itemSides='';
	var itemAdds='';
	var itemMods='';
	var orderHtml='<tr><th id="itemNo">#</th><th>Size</th><th>Item</th><th>Amt</th><th>Cost</th><th style="text-align: center;"><a style="font-size: medium;" onclick="removeAllItems();"><i class="fa fa-trash-o"></i></a></th></tr>';

	for (var i = 0; i <= order.length-1; i++) {
		
		if (order[i].sides.length>0){
			itemSides = 'Sides:';
			for (var j = 0; j <= order[i].sides.length-1; j++) {
			 itemSides=itemSides+order[i].sides[j];
			}
		}

		if (order[i].adds.length>0){
			itemAdds = 'Additional Mods:';
			for (var j = 0; j <= order[i].adds.length-1; j++) {
			 itemAdds=itemAdds+order[i].adds[j];

			}
		}

		if (order[i].mods.length>0){
			itemMods = 'Mods:';
			for (var j = 0; j <= order[i].mods.length-1; j++) {
			 	itemMods=itemMods+order[i].mods[j];
			}
		}

		messageBody=messageBody+'#'+(i+1)+' | '+order[i].size+' '+order[i].item+' | Qty'+order[i].amt+' $'+order[i].cost+printArraySides(i,itemSides)+printArrayMods(i,itemMods)+printArrayAdds(i,itemAdds)+'\n\n';

		//CUSTOM MESSAGE BODY
		//messageBody='#'+messageBody+(i+1)+' | '+'Qty'+order[i].amt+' | '+order[i].size+' '+order[i].item+' $'+order[i].cost+printArraySides(i,itemSides)+printArrayAdds(i,itemAdds)+printArrayMods(i,itemMods)+'\n';
		orderHtml = (orderHtml+'<tr><td id="itemNo">'+(i+1)+'</td><td id="itemSize">'+order[i].size+'</td><td id="itemDesc">'+order[i].item+printHtmlArraySides(i,itemSides)+printHtmlArrayMods(i,itemMods)+printHtmlArrayAdds(i,itemAdds)+'\n'+'</td><td>'+order[i].amt+' </td><th id="itemCost">$'+order[i].cost+'</th><td id="itemXBtn"><a onclick="removeItem('+i+');"><i class="fa fa-close"></i></a></td></tr>');
		// console.log(orderHtml);
		itemAdds=[];
		itemMods=[];
		orderSides=[];
	}

	priceCalc();
	vatCalc();
	serviceCalc();
	document.getElementById("whatsappOrder").innerHTML=orderHtml;
	if(vat>0 || service>0){
		document.getElementById("subTotal").innerText=(price.toFixed(2));
		document.getElementById("subTotalcontainer").classList.remove('hide');
		
	}else {
		document.getElementById("subTotalcontainer").classList.add('hide');
	}
	if(vat>0){
			document.getElementById("vat").innerText=('V.A.T. '+vat*100+'% $');
			document.getElementById("vatCalc").innerText=(vatcost.toFixed(2));
			document.getElementById("vatCalccontainer").classList.remove('hide');
	}else{
		document.getElementById("vatCalccontainer").classList.add('hide');
	}
	if(service>0){
		document.getElementById("service").innerText=('Service Charge '+service*100+'% $');
		document.getElementById("serviceCalc").innerText=(servicecost.toFixed(2));
		document.getElementById("serviceCalccontainer").classList.remove('hide');
	}else{
		document.getElementById("serviceCalccontainer").classList.add('hide');
	}
	var displayTotal=(price+vatcost+servicecost);
	document.getElementById("itemTotal").innerText=('TOTAL $'+displayTotal.toFixed(2));
	constructWAMessage();
}

function openSideMenu() {
	var list = document.getElementById("sideList");
  var con = document.getElementById("itemSideControl");
  list.innerText=printArray(orderSides);
     if(con.classList.contains('hide')){
      con.classList.remove('hide');
    }else{
      con.classList.add('hide');
    }
}

function openAddMenu() {
	var list = document.getElementById("addModList");
  var con = document.getElementById("itemAdditionControl");
  list.innerText=printArray(orderAdd);
     if(con.classList.contains('hide')){
      con.classList.remove('hide');
    }else{
      con.classList.add('hide');
    }
}

function openModMenu() {
	var list = document.getElementById("modList");
  var con = document.getElementById("itemModControl");
  list.innerText=printArray(orderMod);
     if(con.classList.contains('hide')){
      con.classList.remove('hide');
    }else{
      con.classList.add('hide');
    }
}

function printArray(arr){
 	var mod = '';
 	for (var j = 0; j <= arr.length-1; j++) {
			 	mod=mod+'- '+arr[j]+'\n';
			}
	return mod;
 }

function printHtmlArraySides(i,itemSides){
	if (order[i].sides.length>0){
		return ('<br>'+itemSides);
	}else return '';
}
function printHtmlArrayAdds(i,itemAdds){
	if (order[i].adds.length>0){
		return ('<br>'+itemAdds);
	}else return '';
}
function printHtmlArrayMods(i,itemMods){
	if (order[i].mods.length>0){
		return ('<br>'+itemMods);
	}else return '';
}

function printArraySides(i,itemSides){
	if (order[i].sides.length>0){
		return ('\n'+itemSides);
	}else return '';
}

function printArrayAdds(i,itemAdds){
	if (order[i].adds.length>0){
		return ('\n'+itemAdds);
	}else return '';
}

function printArrayMods(i,itemMods){
	if (order[i].mods.length>0){
		return ('\n'+itemMods);
	}else return '';
}

function priceCalc(){
	price = 0;
	for (var i = 0; i <= order.length-1; i++) {
		price=price+order[i].cost;
	}
}

function vatCalc(){
	vatcost=parseFloat((price*vat).toFixed(2));
}
function serviceCalc(){
	servicecost=parseFloat((price*service).toFixed(2));
}


function constructWAMessage(){
	var subTotalTxt='';
	var vatTxt='';
	var servicext='';
	var label='Takeaway';
	if(vat>0 || service>0){
		subTotalTxt='\nSub Total $ '+price.toFixed(2);
		if(vat>0){
			vatTxt='\nV.A.T. '+vat*100+'% $ '+vatcost.toFixed(2);
		}
		if(service>0){
			servicext='\nService Charge '+service*100+'% $ '+servicecost.toFixed(2);
		}
	}
	if(currentMode=='dinein'){
		label=' Table#';
	}
	message = 'https://wa.me/'+number+'?text='+encodeURIComponent(messageStart+label+myTable+'\n'+messageBody+subTotalTxt+vatTxt+servicext+'\nTOTAL $'+(price+vatcost+servicecost)+messageEnd);
}

function confirm(){
		//if(isOpen()){
		if(true){
			constructWAMessage();
			confirmSendOrder();
		}else {
			closeTableModal();
			closeShop();
			closeCart();
			scrollTo('openhours');
		}
}


//Dine modes
function toggleDiningMode(ele){
  if (ele.checked == true){
    selectMode(1);
   
  } else{
    selectMode(0);
    
  }
}
function selectMode(i){
  currentMode = modes[i].name;
  //var checkBox1 = document.getElementById("dining-mode-checkbox-1");
  var checkBox2 = document.getElementById("dining-mode-checkbox-2");
  if(i==1){
  	//checkBox1.checked=true;
  	checkBox2.checked=true;
  	service=0.0;
  }else{
  	//checkBox1.checked=false;
  	checkBox2.checked=false;
  	myTable='';
  	service=0.0;
  }
  //console.log(modes[i].name);
  executeMode();
  buildOrderText();
}


function executeMode(){
	var cart=document.getElementById('cart')
	//cart.classList.remove('cartexpanded');
	//document.getElementById('titleRow').innerHTML='<i class="fa fa-arrow-right"></i> '+currentMode; 
	var server=document.getElementById('askforserver');
	if (currentMode=='dinein'){
		server.classList.remove("hide");
	}else{
		server.classList.add("hide");
	}
  // var ele = document.getElementsByClassName('takeawayonly');
  
  // if (currentMode==modes[0].name){
  //   document.getElementById('takeaway').classList.add('active');
  //   document.getElementById('dinein').classList.remove('active');
  //   // for (var i = ele.length - 1; i >= 0; i--) {
  //   //   ele[i].classList.remove('hide');
  //   // }
  // }else{
  //   // for (var i = ele.length - 1; i >= 0; i--) {
  //   //   ele[i].classList.add('hide');
  //   // }
  //   document.getElementById('dinein').classList.add('active');
  //   document.getElementById('takeaway').classList.remove('active');
  // }
  
 }

function executeModeOnModal(){
  
  // if (currentMode=='dinein'){
  //   var ele = document.getElementById('itemSizeControl').getElementsByTagName("a");
  //   for (var i = ele.length - 1; i >= 0; i--) {
  //     if(ele[i].innerText.substring(0, 1)=="S"){
  //         ele[i].classList.add('hide');
  //         ele[i].classList.remove('select');
  //     }else{
  //         selectOnly(ele[i]);
  //         setBaseSize(ele[i]);
  //     }

  //   }
  // }
}

function executeModeOnTableModal(){	
	var ele1 = document.getElementsByClassName('tableBtn');
	var ele2 = document.getElementsByClassName('takeawayBtn');
	if (currentMode=='takeaway'){
		ele2[0].classList.remove('hide');
		ele2[0].classList.remove('select');
		for (var i = ele1.length - 1; i >= 0; i--) {
     		ele1[i].classList.add('hide');
          	ele1[i].classList.remove('select');
        }
	}else if (currentMode=='dinein'){
		ele2[0].classList.add('hide'); 
		ele2[0].classList.remove('select');   	
		for (var i = ele1.length - 1; i >= 0; i--) {
     		ele1[i].classList.remove('select');
          	ele1[i].classList.remove('hide');
        }
	}
}

function cartSizeToggle(){
	 var cart=document.getElementById('cart')
	 if (cart.classList.contains('cartexpanded')){
	 	cart.classList.remove('cartexpanded');
	 	document.getElementById('titleRow').innerHTML='<i class="fa fa-arrow-right"></i> Order';
	 }else{
	 	cart.classList.add('cartexpanded');
	 	document.getElementById('titleRow').innerHTML='<i class="fa fa-arrow-down"></i> Order';
	 }
}	

function openTableModal(state){
	closeCart();
	if (state=='askforserver'){
		document.getElementById("tableNumberModal").classList.remove('hide');
		document.getElementById("confirmmodal").classList.add('hide');
		document.getElementById("askforservermodal").classList.remove('hide');
		//executeModeOnTableModal();
	}else if (currentMode=='takeaway'){
		confirm();
		return;
	}else{
		document.getElementById("tableNumberModal").classList.remove('hide');
		document.getElementById("askforservermodal").classList.add('hide');
		document.getElementById("confirmmodal").classList.remove('hide');
		//executeModeOnTableModal();
	}
	
}
function closeTableModal(){
	
	document.getElementById("tableNumberModal").classList.add('hide');
}

function selectTable(ele) {
	myTable =''+ele.innerText;
	selectOnly(ele);
	document.getElementById("myTableNum").innerText=ele.innerText;
	
}

function confirmTable(state){
	if(myTable!=''){
		// if(	myTable.endsWith('2L')||myTable.endsWith('14R')){
		// 	number="";
		// }else if(	myTable.endsWith('1')||myTable.endsWith('18R')){
		// 	number="";
		// }else if(	myTable.endsWith('2')||myTable.endsWith('8L')){
		// 	number="";
		// }
		if (state=='askforserver'){
			askforserver();
		}else{
			confirm();
		}
		
	}
}

function askforserver(){
	message = 'https://wa.me/'+number+'?text='+encodeURIComponent('Powered by TTMenus\n'+name+'\n\nHello, Good Day\n'+'Server Requested at Table# '+myTable);
	confirmSendOrder();
}

function confirmSendOrder(){
	//if(price>0){
	window.open(message, "_blank" );
	//}
}

document.addEventListener("DOMContentLoaded", function() {
  requestAnimationFrame(() => { // Ensures DOM is ready before applying scroll
    loadCart();  // Load saved cart from localStorage
    updateCart(order.length);
    
    // Initialize location selection
    initializeLocationSelection();
  });
});

// var lastScrollTop = 0;
// document.addEventListener("scroll", function(){ // or window.addEventListener("scroll"....
//    var st = window.pageYOffset || document.documentElement.scrollTop; // Credits: "https://github.com/qeremy/so/blob/master/so.dom.js#L426"
//    var footerBtns = document.getElementById("footerBtns");
//    //var accessibility = document.getElementById("accessibility");
//    var cart = document.getElementById("cart");
//    if (st > lastScrollTop ) {
//       footerBtns.classList.add('bigfont');
//       footerBtns.classList.add('grad1');
//       footerBtns.classList.remove('smallfont');
//       footerBtns.classList.remove('grad2');
//    } else if (st < lastScrollTop && !cart.classList.contains('hide')) {
//       footerBtns.classList.add('smallfont');
//       footerBtns.classList.add('grad2');
//       footerBtns.classList.remove('bigfont');
//       footerBtns.classList.remove('grad1');
//    } // else was horizontal scroll
//    lastScrollTop = st <= 0 ? 0 : st; // For Mobile or negative scrolling
// }, false);


function toggleTTMS(){
    var ttms = document.getElementById("ttmenusModal");
    var footerBtns = document.getElementById("footerBtns");
    if(ttms.classList.contains('cart-hidden')){
      ttms.classList.remove('cart-hidden');
      footerBtns.classList.add('bigfont');
      footerBtns.classList.remove('smallfont');
      footerBtns.classList.add('grad1');
      footerBtns.classList.remove('grad2');
    }else{
      ttms.classList.add('cart-hidden');
      footerBtns.classList.add('grad2');
      footerBtns.classList.remove('grad1');
      footerBtns.classList.remove('bigfont');
      footerBtns.classList.add('smallfont');
      
    }
  }
  function closeTTMS(){
    var ttms = document.getElementById("ttmenusModal");
    var footerBtns = document.getElementById("footerBtns");
    ttms.classList.add('cart-hidden');
    footerBtns.classList.add('grad2');
    footerBtns.classList.remove('grad1');
    footerBtns.classList.remove('bigfont');
    footerBtns.classList.add('smallfont');
	}