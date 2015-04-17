if (Layer.root.width !== 1024) {
	throw "This prototype is meant to be run in landscape on an iPad"
}

var beatLineYPosition = 300
var beatVelocity = 300 // points per second
var timeBetweenEmission = 1.0 // in seconds
var beatDiameter = 50
var leewayBetweenTouchAndBeat = 0.3 // in seconds
var pitches = ["cat_e", "cat_fsharp", "cat_gsharp", "cat_a", "cat_b"]

var bottomHalf = new Layer()
bottomHalf.frame = new Rect({x: 0, y: beatLineYPosition, width: Layer.root.width, height: Layer.root.height - beatLineYPosition})
bottomHalf.backgroundColor = Color.white

var topHalf = new Layer()
topHalf.frame = new Rect({x: 0, y: 0, width: Layer.root.width, height: beatLineYPosition})
topHalf.backgroundColor = new Color({white: 0.97})
topHalf.cornerRadius = 1 // Hack to make the top half clip to bounds. TODO(andy): make real Prototope API for this

var lastBeatEmissionTime = Timestamp.currentTimestamp() - timeBetweenEmission
var lastTouchSequence = null

var activeBeatGroups = []

Layer.root.behaviors = [
	new ActionBehavior({handler: function() {
		var t = Timestamp.currentTimestamp()
		if (t > lastBeatEmissionTime + timeBetweenEmission) {
			var pitch = Math.floor(Math.random() * pitches.length)

			var beatGroup = new Layer({parent: topHalf})
			beatGroup.frame = new Rect({x: 0, y: -beatDiameter, width: Layer.root.width, height: beatDiameter})
			beatGroup.beats = []
			for (var beatIndex = 0; beatIndex <= pitch; beatIndex++) {
				var beat = makeBeat()
				beat.parent = beatGroup
				beat.pitch = pitch
				beat.x = beatIndex * (beatGroup.width * 0.75 / (pitches.length - 1)) + beatGroup.width * 0.125
				beatGroup.beats.push(beat)
			}
			beatGroup.behaviors = [new ActionBehavior({handler: function() { beatBehavior(beatGroup) }})]
			activeBeatGroups.push(beatGroup)

			lastBeatEmissionTime = t
		}
	}})
]

var touchBursts = []

bottomHalf.touchBeganHandler = function(touchSequence) {
	var nearestBeat = nearestUnpairedBeatToPoint(touchSequence.firstSample.globalLocation)
	var touchLocationInBottomHalf = bottomHalf.convertGlobalPointToLocalPoint(touchSequence.firstSample.globalLocation)
	if (nearestBeat !== undefined) {
		nearestBeat.pairedTime = Timestamp.currentTimestamp()

		lastTouchSequence = touchSequence
		// TODO(andy): You should be able to resize the frame of a shape layer and make the shape resize. Maybe? I dunno...

		var from = touchLocationInBottomHalf
		var to = new Point({x: nearestBeat.x, y: 0})

		var touchBurst = addSquiggleWave(from, to, leewayBetweenTouchAndBeat * 0.9)
		touchBurst.parent = bottomHalf
		touchBursts.push(touchBurst)
		afterDuration(leewayBetweenTouchAndBeat, function() {
			touchBursts.splice(touchBursts.indexOf(touchBurst), 1)	
		})
	} else {
		var burst = new Layer({parent: bottomHalf})
		burst.position = touchLocationInBottomHalf
		burst.width = burst.height = 1
		burst.border = new Border({width: 2, color: new Color({white: 0.8})})
		burst.behaviors = [
			new ActionBehavior({handler: function() {
				var fizzleTime = 0.4
				var maximumSize = 60
				var unitTime = (Timestamp.currentTimestamp() - touchSequence.firstSample.timestamp) / fizzleTime
				burst.width = burst.height = Math.sin(unitTime * Math.PI) * maximumSize
				burst.cornerRadius = burst.width / 2.0
				if (unitTime >= 1) {
					burst.parent = undefined
					burst.behaviors = []
				}
			}})
		]
	}
}

function beatBehavior(beatGroup) {
	var t = Timestamp.currentTimestamp()
	if (beatGroup.lastMovementTimestamp !== undefined) {
		beatGroup.y += (t - beatGroup.lastMovementTimestamp) * beatVelocity
		for (var beat of beatGroup.beats) {
			if (beat.emitter !== undefined) {
				beat.emitter.position = bottomHalf.convertGlobalPointToLocalPoint(beat.parent.convertLocalPointToGlobalPoint(beat.position))
			}
		}
	}
	beatGroup.lastMovementTimestamp = t

	var isPastBurstingLine = beatGroup.y > beatLineYPosition + beatDiameter / 3.0
	if (isPastBurstingLine && beatGroup.burst === undefined) {
		if (t - beat.pairedTime < 0.3) {
			// addSquiggleWave(new Point({x: 0, y: topHalf.frameMaxY}), new Point({x: beat.x, y: topHalf.frameMaxY}), 0.3)
			// beat.animators.scale.target = new Point({x: 10, y: 10})
			// beat.animators.alpha.target = 0
			// new Sound({name: pitches[beat.pitch]}).play()
		} else {
			for (var beat of beatGroup.beats) {
				addBurstEmitter(beat)
			}
		}
		beatGroup.burst = true
	}

	if (beatGroup.y > Layer.root.height) {
		beatGroup.parent = undefined
		beatGroup.behaviors = []
		activeBeatGroups.splice(activeBeatGroups.indexOf(beatGroup), 1)
	}
}

function addSquiggleWave(from, to, duration) {
	var squiggleWave = new ShapeLayer()
	squiggleWave.fillColor = undefined
	squiggleWave.strokeWidth = 1
	squiggleWave.strokeColor = new Color({white: 0.6})
	squiggleWave.lineCapStyle = LineCapStyle.Round

	var startTime = Timestamp.currentTimestamp()

	squiggleWave.behaviors = [
		new ActionBehavior({handler: function() {
			var numberOfSamples = 100
			var frequency = 5
			var amplitude = 20
			var transverseVelocity = -40
			var maximumStrokeWidth = 7

			var unitTime = clip({value: (Timestamp.currentTimestamp() - startTime) / leewayBetweenTouchAndBeat, min: 0, max: 1})
			var lineVector = to.subtract(from).multiply(1)
			var angle = Math.atan2(lineVector.y, lineVector.x)
			var normalAngle = angle + Math.PI / 2.0
			var waveUnitVector = new Point({x: Math.cos(normalAngle), y: Math.sin(normalAngle)})

			squiggleWave.strokeWidth = Math.sin(unitTime * Math.PI) * 7
			
			var segments = []
			for (var sampleIndex = 0; sampleIndex < numberOfSamples; sampleIndex++) {
				var unitSampleIndex = sampleIndex / (numberOfSamples - 1)
				var baseSampleAmplitude = amplitude * Math.sin(unitSampleIndex * Math.PI)
				var sampleAmplitude = Math.sin(unitSampleIndex * Math.PI * 2.0 * frequency + transverseVelocity * Timestamp.currentTimestamp()) * baseSampleAmplitude
				var waveVector = waveUnitVector.multiply(sampleAmplitude)
				var segmentPosition = from.add(lineVector.multiply(sampleIndex / (numberOfSamples - 1)))
				segments.push(new Segment(segmentPosition.add(waveVector)))
			}
			squiggleWave.segments = segments
		}})
	]

	afterDuration(duration, function() {
		squiggleWave.parent = undefined
		squiggleWave.behaviors = []
	})

	return squiggleWave
}

function nearestUnpairedBeatToPoint(point) {
	var nearestBeat = undefined
	var nearestBeatDistance = Number.MAX_VALUE
	for (var beatGroup of activeBeatGroups) {
		if (beatGroup.burst) {
			continue
		}

		for (var beat of beatGroup.beats) {
			var beatDistance = point.distanceToPoint(beat.position)
			if (beatDistance < nearestBeatDistance &&
				(beat.pairedTime === undefined || (Timestamp.currentTimestamp() - beat.pairedTime > leewayBetweenTouchAndBeat * 1.5))) {
				nearestBeatDistance = beatDistance
				nearestBeat = beat
			}
		}
	}

	return nearestBeat
}

function addBurstEmitter(layer) {
	var particle = new Particle({imageName: "sparkles"})
	particle.lifetime = 2.0
	particle.lifetimeRange = 0.3
	particle.alphaSpeed = -2.0
	particle.birthRate = 300
	particle.yAcceleration = 300.0
	particle.velocity = 10
	particle.emissionRange = 2 * Math.PI
	particle.scale = 0.01
	particle.scaleRange = 0.5
	particle.scaleSpeed = 0
	particle.color = layer.fillColor

	var particleEmitter = new ParticleEmitter({particle: particle})
	particleEmitter.shape = "circle"
	particleEmitter.shapeMode = "outline"

	bottomHalf.addParticleEmitter(particleEmitter)
	particleEmitter.size = new Size({width: beatDiameter, height: beatDiameter})
	particleEmitter.position = bottomHalf.convertGlobalPointToLocalPoint(layer.parent.convertLocalPointToGlobalPoint(layer.position))
	layer.emitter = particleEmitter

	afterDuration(0.2, function() {
		particleEmitter.birthRate = 0
		afterDuration(particle.lifetime + particle.lifetimeRange, function() {
			bottomHalf.removeParticleEmitter(particleEmitter)
			layer.emitter = undefined
		})
	})
}

function makeBeat() {
	var beat = new ShapeLayer.Circle({center: Layer.root.position, radius: beatDiameter / 2.0, parent: topHalf})
	beat.fillColor = Color.orange
	beat.strokeColor = undefined
	beat.origin = Point.zero
	beat.animators.alpha.springBounciness = 0
	beat.animators.alpha.springSpeed = 5
	beat.animators.scale.springBounciness = 0
	beat.animators.scale.springSpeed = 5
	return beat
}