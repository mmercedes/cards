
/* SERVER STATE GLOBALS */
var ip = process.env.OPENSHIFT_NODEJS_IP;
var port = process.env.OPENSHIFT_NODEJS_PORT || 4004;
var fs = require('fs');
var express = require('express');
var http = require('http');
var UUID = require('node-uuid');
var app = express();
var server = http.createServer(app);


/* GAME STATE GLOBALS */
var lobby = [];
var players = [];
var pendPlayers = [];
var highestScore = 0;
var submissions = [];
var submitIDs = [];
var ingame = false;
var judge;
var cards = JSON.parse(fs.readFileSync("cards.json", "utf8"));
var roundInfo = {};
var roundWinner = null;
var submitTimeout;
var judgeTimeout;


/* CONSTANTS */
var MAX_PLAYERS = 8;
var MIN_PLAYERS = 2;


if (typeof ip === "undefined") {
    //  Log errors on OpenShift but continue w/ 127.0.0.1 - this
    //  allows us to run/test the app locally.
    console.warn('No OPENSHIFT_NODEJS_IP var, using localhost');
    ip = "localhost";
};

server.listen(port);
console.log("\n STARTED SERVER ON PORT " + port + "\n");

var socket = require('socket.io').listen(server);

app.get( '/', function( req, res ){
    res.sendfile('game.html');
});

app.get( '/*' , function( req, res, next ) {
    //This is the current file they have requested
	var file = req.params[0];
	res.sendfile( __dirname + '/' + file );
});


function disconnect(client){
    for(var i = 0; i < players.length; i++){
        if(players[i].userid == client.userid){
            players.splice(i, 1);
            if(players.length == MIN_PLAYERS-1){
                ingame = false;
                console.log("GAME ENDED");
            }
            break;
        }
    }
    for(var i = 0; i < pendPlayers.length; i++){
        if(pendPlayers[i].userid == client.userid){
            pendPlayers.splice(i, 1);
            break;
        }
    }
    for(var i = 0; i < lobby.length; i++){
        if(lobby[i].userid == client.userid){
            lobby.splice(i, 1);
            break;
        }
    }
}

function setName(client, data){
    client.username = data.username;

    for(var i = 0; i < lobby.length; i++){
        if(lobby[i].userid == client.userid){
            lobby.splice(i, 1);
            break;
        }
    }
    if(ingame){
        pendPlayers.push(client);
        client.emit("pending", roundInfo);
    }
    else{
        if(players.length >= MAX_PLAYERS){
            client.emit('disconnect');
            return;
        }
        players.push(client);
        if(players.length == MIN_PLAYERS) startGame();
    }
}

function sendMessage(client, data){
	socket.sockets.emit("message", {username:client.username, msg:data.msg});
}

function startGame(){
	console.log("GAME STARTED");
	ingame = true;
	socket.sockets.emit('start', {});
	for(var i = 0; i < players.length; i++){
			players[i].score = 0;
	}
	playRound();
}

function endGame(){
    highestScore = 0;
    ingame = false;
    return;
}

function playRound(){
    while(players.length < MAX_PLAYERS && pendPlayers.length > 0){
        pendPlayers[0].score = 0;
        players.push(pendPlayers[0]);
        pendPlayers.shift();
    }
    if(players.length < MIN_PLAYERS){
        endGame();
        return;
    }
	console.log("ROUND STARTED");

    judge = players[Math.floor(Math.random()*players.length)];

	roundInfo.card = getBlackCard();
    roundInfo.judge = judge.userid;
	roundInfo.players = [];

	for(var i = 0; i < players.length; i++){
		roundInfo.players.push({username:players[i].username,
								score:players[i].score})
	}
	socket.sockets.emit('roundStart', roundInfo);
	// wait 62 seconds to gather responses
	submitTimeout = setTimeout(function (){
		console.log("SUBMIT TIME OVER");
		forwardSubmissions();
		// wait 62 seconds for judge to pick
		judgeTimeout = setTimeout(updateScore, 62000);
	}, 62000);
}

function getBlackCard(){
	return cards.bcards[Math.floor(Math.random()*cards.bcards.length)];
}

function getCards(client, data){
	var index;
	var sendData = {};
	sendData.cards = [];
	for(var i = 0; i < data.num; i++){
		index = Math.floor(Math.random()*cards.wcards.length)
		sendData.cards.push(cards.wcards[index]);
	}
	client.emit('setHand', sendData);
}

function addSubmission(id, submission){
	submissions.push(submission);
	submitIDs.push(id);
	if(submissions.length === players.length){
		clearTimeout(submitTimeout);
		forwardSubmissions();
		judgeTimeout = setTimeout(updateScore, 62000);
	}
}

function forwardSubmissions(){
	if(submissions.length > 0){
		console.log(submitIDs);
		judge.emit('judgeCards', {subs:submissions, subIDs:submitIDs});
		submissions = [];
		submitIDs = [];
	}
	else console.log("NO SUBMISSIONS RECEIVED");
}

function setRoundWinner(userid){
	for(var i = 0; i < players.length; i++){
		if(players[i].userid === userid){
			roundWinner = players[i];
			break;
		}
	}
	clearTimeout(judgeTimeout);
	updateScore();
}

function updateScore(){
	console.log("JUDGE TIME OVER");
	if(roundWinner != null){
		roundWinner.score += 1;
		if(roundWinner.score > highestScore){
			highestScore += 1;
		}
		roundWinner = null;
	}
	if(highestScore == 5){
		endGame();
	}
	else playRound();
}

/* CONFIGURE SOCKET */
// socket.configure(function (){
//     socket.set('log level', 0);
//     socket.set('authorization', function (handshakeData, callback) {
//       callback(null, true);
//     });
// });


/* HANDLE CONNECTIONS AND DISCONNECTS */
socket.sockets.on('connection', function (client) {
	if(players.length >= MAX_PLAYERS){
		client.emit('disconnect');
		return;
	}
    client.userid = UUID();
    client.emit('connect', {id: client.userid, game: ingame});
    lobby.push(client);

    client.on('disconnect', function (){
        disconnect(client);
    });
    client.on('setName', function (data){
        setName(client, data);
    });
    client.on('getCards', function (data){
    	getCards(client, data);
    });
    client.on('message', function (data){
    	sendMessage(client, data);
    });
    client.on('submitCards', function (data){
    	addSubmission(client.userid, data.sub);
    });
    client.on('submitPick', function (data){
    	setRoundWinner(data.userid);
    })
});



/********	TODO LIST	********
 *
 *	don't send card multiple times
 *	sent cards contain 'undefined'
 *
 *******************************/
