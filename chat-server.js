// Require the packages we will use:
'use strict';

var http = require("http"),
	socketio = require("socket.io"),
	fs = require("fs"),
	ChatRoom = require('./chat-room.js'),
	User = require('./user.js'),
	Message = require('./message.js');
 
var users = {}; // map from user id -> user object
var chatRooms = []; // array of chat rooms (index is the)
var connections = [];
var chatHistory = {}; // map from roomId to array of messages
var privateMessages = {}; // map from privateRoomId to array of messages

// Listen for HTTP connections.  This is essentially a miniature static file server that only serves our one file, client.html:
var app = http.createServer(function(req, resp){
	// This callback runs when a new connection is made to our HTTP server.
 
	fs.readFile("client.html", function(err, data){
		// This callback runs when the client.html file has been read from the filesystem.
 
		if (err) return resp.writeHead(500);
		resp.writeHead(200);
		resp.end(data);
	});
});

app.listen(3456);
 
// Do the Socket.IO magic:
var io = socketio.listen(app);
io.sockets.on("connection", function(socket) {
	// This callback runs when a new Socket.IO connection is established.
 	connections.push(socket);
 	 
	socket.on('message_to_server', function(data) {
		var room = chatRooms[data["room"]];
		var messageText = data["message"];
		var sentAt = data["sent_at"];
		var user = users[socket.id];

		console.log(user.username + ": " + messageText + " in room " + room.name + " at " + sentAt);
		
		if (!chatHistory.hasOwnProperty(room.id)) {
			// create new chat history
			chatHistory[room.id] = [];
		}

		// add the message to the history
		var message = new Message(user, messageText, room.id, sentAt);

		var history = chatHistory[room.id];
		history.push(message);
		
		io.sockets.in(room.name).emit('message_to_client', { chat_history: history } );
	});

	socket.on('private_message_to_server', function(data) {
		var room = chatRooms[data["room"]];
		var messageText = data["message"];
		var sentAt = data["sent_at"];
		var toUserId = data["to_user_id"];
		var toUser = users[toUserId];
		var user = users[socket.id];

		console.log(user.username + ": " + messageText + " in room " + room.name + " at " + sentAt + " to user " + toUserId);
		var pairId = getUniquePairId(user, toUser);
		console.log(pairId);

		if (!privateMessages.hasOwnProperty(pairId)) {
			// create new chat history
			privateMessages[pairId] = [];
		}

		// add the message to the history
		var message = new Message(user, messageText, room.id, sentAt);
		message.private = true;
		message.toUser = toUser;

		if (userInRoom(room, toUser)) {
			var socketOfUserToMessage = find(connections, toUserId);
			console.log(toUserId);
			console.log(connections);
			var history = privateMessages[pairId];
			history.push(message);
			
			socketOfUserToMessage.emit('private_message_to_client', { chat_history: history } );
			socket.emit('private_message_to_client', { chat_history: history } );
		} else {
			console.log("unable to message user " + message.toUserId);
		}
		
	});

	socket.on('create_user', function(data, callback) {
		var username = data["username"];
		if (username) {
			socket.username = username;

			var userAlreadyExists = false;
			var oldUserId;
			for (var id in users) {
				if (users.hasOwnProperty(id)) {
	            	if (users[id].username === username) {
	                	userAlreadyExists = true;
	                	oldUserId = id;
	                    break;
	                }
                }
            }

			if (userAlreadyExists) {
				// if username already exists, then reset the id to the socket id
				var oldUser = users[oldUserId];

				var user = oldUser;
				user.id = socket.id;
				users[user.id] = user;
				delete users.oldUserId;
				// update owner IDs and users
				for (var i = 0; i < chatRooms.length; i++) {
					var room = chatRooms[i];
					// update owner
					if (room.owner.username === username) {
						room.owner.id = user.id;
					}
					// update users
					for (var i = 0; i < room.users.length; i++) {
						var roomUser = room.users[i];
						if (roomUser.username === username) {
							roomUser.id = user.id;
						}
					}
					// update banned users
					for (var i = 0; i < room.bannedUsers.length; i++) {
						var roomUser = room.bannedUsers[i];
						if (roomUser.username === username) {
							roomUser.id = user.id;
						}
					}
				}
				console.log(username + " rejoined the server with id " + socket.id);
			} else {
				// if creating new new user
				var user = new User(socket.id, socket.username);
				users[user.id] = user;
				console.log(username + " joined the server with id " + socket.id);
			}
					
			callback( { success: true } );

			// send update to all users
			io.sockets.emit("update_users", users);

			// send chat room list to the newly registered client
			socket.emit("update_chat_rooms", { rooms: chatRooms });
		} else {
			// handle error: username is empty
			callback( { success: false, message: "username cannot be empty" } );
		}
	});

	// remove socket from connection, if there is a username
	socket.on('disconnect', function(data) {

		// remove this user from all other chat rooms' user lists
		var user = users[socket.id];
		if (typeof user !== "undefined") {
			removeUserFromAllRooms(chatRooms, user);
		}
		
		// remove socket connection
		connections.splice(connections.indexOf(socket), 1);
		console.log("Disconnected: " + connections.length + " connections remaining");

		// send update to all users
		io.sockets.emit("update_users", users);
		io.sockets.emit("update_chat_rooms", { rooms: chatRooms } );
	});
	
	socket.on('client_user_typing', function(data) {
		var username = data["username"];
		var roomId = data["room_id"];
		var room = chatRooms[roomId];

		io.sockets.in(socket.room).emit('server_user_typing', { username: username } );
	});

	socket.on('request_user_info', function(data) {
		var currentUser = users[socket.id];

		var createdRooms = [];
		var bannedFromRooms = [];
		var numMessagesSent = 0;
		for (var i = 0; i < chatRooms.length; i++) {
			var room = chatRooms[i];
			if (room.owner.id === currentUser.id) {
				createdRooms.push(room.name);
			}
			
			for (var j = 0; j < room.bannedUsers.length; j++) {
				var user = room.bannedUsers[j];
				if (user.id === currentUser.id) {
					bannedFromRooms.push(room.name);
				}
			}

			if (chatHistory.hasOwnProperty(room.id)) {
				var messages = chatHistory[room.id];
				for (var j = 0; j < messages.length; j++) {
					var message = messages[j];
					if (message.user.id === currentUser.id) {
						numMessagesSent++;
					}
				}
	        }
			
	    }

		socket.emit('recieved_user_info', { id: currentUser.id, username: currentUser.username, created_rooms: createdRooms, banned_rooms: bannedFromRooms, num_messages_sent: numMessagesSent } );
	});

	socket.on('create_chat_room', function(data, callback) {
		var name = data["name"];
		var passwordProtected = data["password_protected"];
		var password = data["password"];
		if (name) {
			var owner = users[socket.id];
			var id = chatRooms.length;
			var room = new ChatRoom(name, id, owner);

			// check that the room name isn't taken
			for (var i = 0; i < chatRooms.length; i++) {
				var chatRoom = chatRooms[i];
				if (chatRoom.name == name) {
					callback( { success : false, message: "Room name " + name + " already taken" } );
					return;
				}
			}

			if (passwordProtected) {
				if (password.length < 3) {
					callback( { success : false, message: "Password must be at least 4 characters" } );
					return;
				}
				room.passwordProtected = true;
				room.password = password;
			}

			// if user is already in a room, then remove user from room
			if (socket.room) {
				console.log(owner.username + " leaving " + socket.room);
				removeUserFromAllRooms(chatRooms, owner);
				socket.leave(socket.room);
			}

			if (!chatHistory.hasOwnProperty(room.id)) {
				// create new chat history
				chatHistory[room.id] = [];
			}

			socket.room = room.name;
			socket.join(socket.room);
			
			room.addUser(owner);

			chatRooms.push(room);

			callback( { success : true, room_id: room.id } );
			console.log(chatRooms);

			io.sockets.in(socket.room).emit('update_active_users', { room: room } );
			io.sockets.in(socket.room).emit('update_banned_users', { room: room } );
			// send message to all sockets with update of all active chat rooms
			io.sockets.emit("update_chat_rooms", { rooms: chatRooms } );

		} else {
			callback( { success : false, message : "chat room name cannot be empty" } );
		}
	});

	socket.on('kick_user', function(data) {
		var roomId = data["room_id"];
		var userId = data["user_id"];

		var room = chatRooms[roomId];
		var userToKick = users[userId];
		var currentUser = users[socket.id];

		// if currentUser is allowed to kick the userToKick, then kick
		if ( room.owner.id === currentUser.id )  {
			room.removeUser(userToKick);
			var socketOfUserToKick = find(connections, userToKick.id);
			socketOfUserToKick.leave(socketOfUserToKick.room);

			io.sockets.in(socket.room).emit('update_active_users', { room: room } );
			socketOfUserToKick.emit('update_active_users', { room: room } );
			io.sockets.emit("update_chat_rooms", { rooms: chatRooms } );
		}
	});

	socket.on('ban_user', function(data, callback) {
		var roomId = data["room_id"];
		var userId = data["user_id"];

		var room = chatRooms[roomId];
		var userToBan = users[userId];
		var currentUser = users[socket.id];

		// if currentUser is allowed to ban the userToBan, then ban
		if ( room.owner.id === currentUser.id )  {
			console.log("banning user " + userToBan.username + " with id " + userToBan.id);
			// also have to kick user
			room.removeUser(userToBan);
			room.banUser(userToBan);
			var socketOfUserToBan = find(connections, userToBan.id);
			socketOfUserToBan.leave(socketOfUserToBan.room);
			console.log(room);
			callback( { success : true } );

			io.sockets.in(socket.room).emit('update_active_users', { room: room } );
			io.sockets.in(socket.room).emit('update_banned_users', { room: room } );

			// TEST this
			console.log(socketOfUserToBan);
			socketOfUserToBan.emit('user_banned', { room: room } );
			// socketOfUserToBan.emit('update_active_users', { room: room } );
			// socketOfUserToBan.emit('update_banned_users', { room: room } );

			io.sockets.emit("update_chat_rooms", { rooms: chatRooms } );
		} else {
			callback( { success : false, message : "You must own the room to ban a user" } );
		}
	});

	socket.on('join_chat_room', function(data, callback) {
		var roomId = data["room_id"];

		// if room ID is valid, then try to join the room
		if (roomId >= 0 && roomId < chatRooms.length) {
			var room = chatRooms[roomId];
			var user = users[socket.id];
			console.log("user trying to join room " + user +" room " + room);
			if (room.passwordProtected) {
				// attempt to match password
				var passwordGuess = data["password"];
				if (passwordGuess != room.password) {
					callback( { success : false, message: "Invalid password" } );
					return;
				}
			} else if (userBannedForRoom(room, user)) {
				callback( { success : false, message: "You are banned from this room" } );
				return;
			}

			// check if user already in the room
			if (userInRoom(room, user)) {
				// can't join a room you are already in!
				callback( { success : false, message: "cannot rejoin the room " + room.name } );		
			} else {

				// remove user from all other chat rooms first
				removeUserFromAllRooms(chatRooms, user);

				// now join
				socket.room = room.name;
				socket.join(socket.room);
				room.addUser(user);
				console.log(socket.username + " joined chat room " + socket.room);

				callback( { success : true } );			

				io.sockets.in(socket.room).emit('update_active_users', { room: room } );
				io.sockets.in(socket.room).emit('update_banned_users', { room: room } );
				io.sockets.in(room.name).emit('message_to_client', { chat_history: chatHistory[room.id] } );

				// send message to all sockets with update of all active chat rooms
				io.sockets.emit("update_chat_rooms", { rooms: chatRooms } );
			}
		} else {
			callback( { success : false, message : "Invalid chat room ID" } );
		}
	})

});

function removeUserFromAllRooms(rooms, user) {
	for (var i = 0; i < rooms.length; i++) {
		var room = rooms[i];
		if (userInRoom(room, user)) {
			room.removeUser(user);		
		}
	}
}



function userInRoom(room, user) {
	return typeof find(room.users, user.id) !== "undefined";
}

function userBannedForRoom(room, user) {
	return typeof find(room.bannedUsers, user.id) !== "undefined";
}

function find(array, id) {
	 for (var i = 0; i < array.length; i++) {
        if (array[i].id === id) {
            return array[i];
        }
    }
}

function getUniquePairId(firstUser, secondUser) {
	var firstUsername = firstUser.username;
	var secondUsername = secondUser.username;
	if (firstUsername.localeCompare(secondUsername) === -1) {
		// firstUsername is "<" (before) secondUsername 
		return firstUsername + secondUsername;
	} else if (firstUsername.localeCompare(secondUsername) === 1) {
		// firstUsername is ">" (after) secondUsername
		return secondUsername + firstUsername;
	} else {
		// ids are equal, should throw an error
	}
}
