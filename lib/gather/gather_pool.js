"use strict"

/*
 * Implements a pool of concurrent gathers 
 * (no longer a singleton class, should rename)
 *
 */

const _ = require("lodash");
const Gather = require("./gather");
const winston = require("winston");
const mongoose = require("mongoose");
const ArchivedGather = mongoose.model("ArchivedGather");
let gatherCallbacks = {};
let archiveUpdatedCallback = () => {};

const GatherPool = new Map();
const GATHER_CONFIGS = [
	{
		type: "public",
		name: "Public Gather",
		description: "No requirements, 6v6"
	},
	{
		type: "skilled",
		name: "Competitive Gather",
		description: "Hive Requirements, 6v6"
	}
];

GATHER_CONFIGS.forEach(config => {
	const gatherManager = {
		type: config.type,
		name: config.name,
		registerCallback: function (type, method) {
			if (this.gatherCallbacks[type]) {
				this.gatherCallbacks[type].push(method);
			} else {
				this.gatherCallbacks[type] = [method];
			}
		},
		onArchiveUpdate: function (callback) {
			archiveUpdatedCallback = callback;
		},
		restart: function () {
			this.previousGather = undefined;
			this.current = undefined;
			return newGather();
		},
		reset: function () {
			return newGather();
		},
		current: Gather(),
		previous: undefined,
		gatherCallbacks: {}
	};
	
	gatherManager.gatherCallbacks['onDone'] = [function () {
		rotateGather();
	}];

	const newGather = () => {
		const newGatherConfig = _.clone(config);

		newGatherConfig.onEvent = function () {
			gatherManager.gatherCallbacks['onEvent'].forEach(cb => {
				cb.apply(this, [].slice.call(arguments))
			});
		};

		newGatherConfig.onDone = function () {
			gatherManager.gatherCallbacks['onDone'].forEach(cb => {
				cb.apply(this, [].slice.call(arguments))
			});
		};

		return gatherManager.current = Gather(newGatherConfig);
	};

	const archiveGather = gather => {
		ArchivedGather.archive(gather, (error, result) => {
			if (error) return winston.error(error);
			if (archiveUpdatedCallback 
				&& typeof archiveUpdatedCallback === 'function') {
				archiveUpdatedCallback();
			}
		});
	};

	const rotateGather = () => {
		if (gatherManager.current) {
			gatherManager.previous = gatherManager.current;
			archiveGather(gatherManager.previous);
		}
		return newGather();
	};

	GatherPool.set(config.type, gatherManager)

});

// Register initial callback to reset gather when state is `done`

module.exports = GatherPool;