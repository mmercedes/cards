
var socket = io.connect('/');

var myId;
var Hand = [];
var judge = false;
var inputs = -1;
var selectedData = [];
var selectedCards = [];
var pending = false;
var timer;
var timeInterval;
var savedCards = [];
var subIDs;

var MAX_PLAYERS = 8;
var CARD_COUNT = 8;
var CHAT_LENGTH = 1000;

/* DEFINE CARD CLASS */

function Card(id){
	this.div = document.getElementById(id);
	this.text = document.getElementById(id+'p');
	this.selected = false;
	this.visible = false;
	this.id = id;
}

Card.prototype.show = function(){
	this.div.removeAttribute('style');
	this.div.className = 'card animated fadeInUp';
	this.visible = true;
}

Card.prototype.hide = function(){
	if(this.selected){
		this.div.className = 'selected animated bounceOutDown';
	}
	else {
		this.div.className = 'card animated fadeOutDown';
	}
	this.visible = false;
}

Card.prototype.select = function(){
	this.selected = true;
	this.div.className = 'selected';
	selectedCards.push(this);
	selectedData.push(this.text.innerHTML);
}

Card.prototype.deselect = function(){
	this.selected = false;
	this.div.className = 'card';
	selectedCards.shift();
	selectedData.shift();
}

Card.prototype.setText = function(text){
	this.text.innerHTML = text;
}

Card.prototype.save = function(){
	savedCards.push(this.text.innerHTML);
}

Card.prototype.load = function(){
	this.setText(savedCards.shift());
}

/* END DEFINITION */


function showWaitScreen(){
	document.getElementById('topbar').innerHTML = "<h3 id='topbarh'>WAITING FOR MORE PLAYERS...</h3>";
}

function showGame(){
	document.getElementById('content').removeAttribute("style");
	document.getElementById('sidebar').removeAttribute("style");
	document.getElementById('topbarh').innerHTML = "SUBMIT TIME LEFT : 60";
	document.getElementById('topbar').style.paddingTop = "0%";
	document.getElementById('blackcard').removeAttribute("style");
	document.getElementById('blackcard').style.visibility = "hidden";
	document.getElementById('hand').removeAttribute("style");
}

function showPending(){
	document.getElementById('content').removeAttribute("style");
	document.getElementById('sidebar').removeAttribute("style");
	document.getElementById('topbar').innerHTML = "<h3 id='topbarh'>WAITING FOR NEXT ROUND...</h3>"
	document.getElementById('topbar').style.paddingTop = "0%";
}

function hidePending(){
	document.getElementById('topbarh').innerHTML = "";
	document.getElementById('topbar').style.paddingTop = "0%";
	document.getElementById('hand').removeAttribute("style");
}

function hideHand(){
	document.getElementById('hand').className = "animated fadeOutDown";
}

function showHand(){
	document.getElementById('hand').className = "animated fadeInUp";
}

function setHand(cards){
	var index = 0;

	for(var i = 0; i < CARD_COUNT; i++){
		if(!Hand[i].visible){
			Hand[i].setText(cards[index]);
			Hand[i].show();
			index++;
		}
	}
}

function createCards(){
	for(var i = 0; i < CARD_COUNT; i++){
		Hand.push(new Card("card"+i));
	}
}

function setName(){
	var name = document.getElementById('nameInput').value;
	// PERFORM VALIDATION HERE //
	socket.emit('setName', {username:name});
	showWaitScreen();
}

function setPlayers(players){
	for(var i = 0; i < players.length; i++){
		pn = document.getElementById("pn"+i.toString());
		pn.innerHTML = players[i].username +' ('+players[i].score+')';;
		pn.removeAttribute('style');
	}
	for(i = players.length; i < MAX_PLAYERS; i++){
		pn = document.getElementById('pn'+i.toString());
		pn.style.visibility = 'hidden';
	}
}

function setRoundData(data){
	inputs = data.card.inputs;
	judge = (myId === data.judge);
	document.getElementById('bcardh').innerHTML = data.card.text;
	document.getElementById('blackcard').removeAttribute('style');
	setPlayers(data.players);
	if(judge) setJudge();
}

function setJudge(){
	hideHand();

	for(var i = 0; i < CARD_COUNT; i++){
		Hand[i].save();
	}
}

function setJudgeCards(submissions){
	for(var i = 0; i < submissions.length; i++){
		Hand[i].setText(submissions[i]);
		Hand[i].show();
	}
	for(i = submissions.length; i < CARD_COUNT; i++){
		Hand[i].hide();
	}
	showHand();
}

function selectCard(card){
	if(!judge){
		if(selectedCards.length === inputs){
			selectedCards[0].deselect();
		}
		var index = parseInt(card.id.charAt(4),10);
		Hand[index].select();
	}
	else {
		submitJudgePick(card);
	}
}

function sendMessage(event){
	if(event.keyCode != 13) return;
	var data = {};
	data.msg = document.getElementById("chatmsg").value;
	document.getElementById("chatmsg").value = "";
	socket.emit('message', data);
}

function postMessage(data){
	console.log(data.msg);
	var chatbox = document.getElementById("chatbox");
	if(chatbox.value.length > CHAT_LENGTH){
		chatbox.value = chatbox.value.slice(chatbox.value.indexOf("\n"));
	}
	chatbox.value += "<"+data.username+"> "+data.msg+"\n";
	chatbox.scrollTop = chatbox.scrollHeight;
}

function updateTimer(){
	timer--;
	var topbarh = document.getElementById('topbarh');
	if(judge){
		topbarh.innerHTML = 'WAITING ON SUBMISSIONS : ' + timer.toString();
	}
	else {
		topbarh.innerHTML = 'SUBMIT TIME LEFT : ' + timer.toString();
	}
	if(timer === 0){
		window.clearInterval(timeInterval);
		timer = 60;
		if(judge){
			topbarh.innerHTML = 'SELECT YOUR FAVORITE';
		}
		else {
			topbarh.innerHTML = 'THE JUDGE IS PICKING THEIR FAVORITE';
			submitCards();
		}
	}
}

function submitCards(){
	if(selectedData.length === 0) return;

	for(var i = 0; i < selectedCards.length; i++){
		selectedCards[i].hide();
	}
	var submission = selectedData.join('\n\n');
	socket.emit('submitCards', {sub:submission});
	setTimeout(function (){
		socket.emit('getCards', {num:selectedCards.length});
		selectedData = [];
		selectedCards = [];
	}, 2000);
}

function submitJudgePick(card){
	var index = parseInt(card.id.charAt(4),10);
	console.log(index);
	socket.emit('submitPick', {userid:submitIDs[index]});
	submitIDs = [];
	Hand[index].hide();
	setTimeout(function(){
		hideHand();
		setTimeout(function(){
			for(var i = 0; i < CARD_COUNT; i++){
				Hand[i].load();
				Hand[i].show();
			}
			showHand();
		})
	}, 500);
}


socket.on('connect', function (data){
	if(data == null) return;
	myId = data.id;
	createCards();
	socket.emit('getCards', {num:8});
});

socket.on('disconnect', function(){
	socket.disconnect();
	console.log("KICKED FROM SERVER");
});

socket.on('start', function (data){
	showGame();
});

socket.on('roundStart', function (data){
	if(pending) hidePending();
	setRoundData(data);
	timer = 60;
	timeInterval = window.setInterval(updateTimer, 1000);
});

socket.on('pending', function (data){
	pending = true;
	showPending();
	setRoundData(data);
});

socket.on('setHand', function (data){
	setHand(data.cards);
});

socket.on('message', function (data){
	postMessage(data);
});

socket.on('judgeCards', function (data){
	submitIDs = data.subIDs.slice(0);
	setJudgeCards(data.subs);
});

/********	TODO LIST	********
 *
 *	purge old messages from chat
 *	formatting for chat
 *	show hand/cards for judge
 *	judge sees all cards
 	for a bit when submits are set
 *
 ********				********/
